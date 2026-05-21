'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Area, ComposedChart, Bar } from 'recharts'
import { Search, TrendingUp, TrendingDown, AlertTriangle, Calculator, BarChart3, Activity, Calendar } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface DateRange {
  startDate: string
  endDate: string
  tradingDays: number
  offsetDays: number
}

interface DeviationData {
  date: string
  stockPrice: number
  indexPrice: number
  stockChange: number
  indexChange: number
  deviation: number
  stockCumulativeChange: number
  indexCumulativeChange: number
  cumulativeDeviation: number
}

interface StockData {
  stockCode: string
  stockName: string
  market: string
  indexName: string
  indexCode: string
  stockData: { date: string; close: number; open: number; high: number; low: number }[]
  indexData: { date: string; close: number; open: number; high: number; low: number }[]
  deviations: DeviationData[]
  totalDeviation: number
  latestStockPrice: number
  latestIndexPrice: number
  stockInfo: {
    name: string
    open: number
    lastClose: number
    current: number
    high: number
    low: number
  } | null
  dateRange: DateRange
  baseStockPrice: number
  baseIndexPrice: number
  safeRanges?: SafeRange[]
}

interface PricePrediction {
  day: string
  minPrice: number
  maxPrice: number
  indexMin: number
  indexMax: number
  baseStockPrice: number
  baseIndexPrice: number
  currentDeviation: number
}

interface SafeRange {
  date: string
  baseStock: number
  baseIndex: number
  minSafe: number
  maxSafe: number
}

export default function StockAnalyzer() {
  const [stockCode, setStockCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<StockData | null>(null)
  const [indexVolatility, setIndexVolatility] = useState([3]) // 指数波动范围 ±x%
  const [predictions, setPredictions] = useState<PricePrediction[]>([])
  const [offsetDays, setOffsetDays] = useState('0') // 0=今天, 1=昨天, 2=前天...
  const [indexAssumption, setIndexAssumption] = useState<'unchanged' | 'fixed' | 'percent'>('unchanged')
  const [assumedIndexValue, setAssumedIndexValue] = useState('0')
  
  // 200% 异动阈值
  const ABNORMAL_THRESHOLD = 200
  
  const fetchData = useCallback(async (offset: string = offsetDays) => {
    if (!stockCode.trim()) {
      setError('请输入股票代码')
      return
    }
    
    setLoading(true)
    setError('')
    
    try {
      const response = await fetch(`/api/stock?code=${encodeURIComponent(stockCode.trim())}&offset=${offset}`)
      const result = await response.json()
      
      if (!response.ok) {
        setError(result.error || '获取数据失败')
        setData(null)
        return
      }
      
      setData(result)
      // 计算预测
      calculatePredictions(result, indexVolatility[0])
    } catch {
      setError('网络错误，请稍后重试')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [stockCode, indexVolatility, offsetDays])
  
  // 处理日期选择变化
  const handleOffsetChange = (value: string) => {
    setOffsetDays(value)
    if (stockCode.trim()) {
      fetchData(value)
    }
  }
  
  // 计算价格预测 - 使用正确的偏离计算口径
  // 30日偏离 = 股票30日累计涨跌幅 - 指数30日累计涨跌幅
  // 关键：30日窗口会滑动！明天的基准价是D-29，后天的基准价是D-28
  const calculatePredictions = useCallback((stockData: StockData, volatility: number) => {
    if (!stockData || stockData.stockData.length === 0 || stockData.indexData.length === 0) return
    
    const { latestStockPrice, latestIndexPrice } = stockData
    
    const days = ['今天', '明天', '后天']
    const newPredictions: PricePrediction[] = []
    
    const referenceStockPrice = latestStockPrice
    const referenceIndexPrice = latestIndexPrice
    let currentStockPrice = latestStockPrice
    let currentIndexPrice = latestIndexPrice
    
    for (let i = 0; i < 3; i++) {
      // 30日窗口滑动：今天用stockData[0]，明天用stockData[1]，后天用stockData[2]
      // i=0(今天): 基准是30日前的价格 stockData[0]（D-30）
      // i=1(明天): 窗口滑动1天，基准变成stockData[1]（D-29）
      // i=2(后天): 窗口滑动2天，基准变成stockData[2]（D-28）
      const baseStockPrice = stockData.stockData[i]?.close || stockData.stockData[0].close
      const baseIndexPrice = stockData.indexData[i]?.close || stockData.indexData[0].close
      
      // 指数最大/最小变化后的价格
      const indexMaxPrice = currentIndexPrice * (1 + volatility / 100)
      const indexMinPrice = currentIndexPrice * (1 - volatility / 100)
      
      // 计算在指数涨跌后，股票不触发200%异动的安全价格区间
      // 偏离值 = 股票累计涨跌幅 - 指数累计涨跌幅
      // 要求: -200% <= 偏离值 <= 200%
      
      // 当指数跌到最低时，计算股票价格上限（正偏离上限200%）
      // 200% >= (stockPrice/baseStock - 1)*100 - (indexMinPrice/baseIndex - 1)*100
      // stockPrice <= baseStock * (3 + (indexMinPrice/baseIndex - 1))
      const indexMinCumulativeChange = (indexMinPrice / baseIndexPrice - 1) * 100
      const maxStockCumulativeChange = 200 + indexMinCumulativeChange
      const maxStockPrice = baseStockPrice * (1 + maxStockCumulativeChange / 100)
      
      // 当指数涨到最高时，计算股票价格下限（负偏离下限-200%）
      // -200% <= (stockPrice/baseStock - 1)*100 - (indexMaxPrice/baseIndex - 1)*100
      // stockPrice >= baseStock * (-1 + (indexMaxPrice/baseIndex - 1))
      const indexMaxCumulativeChange = (indexMaxPrice / baseIndexPrice - 1) * 100
      const minStockCumulativeChange = -200 + indexMaxCumulativeChange
      const minStockPrice = baseStockPrice * (1 + minStockCumulativeChange / 100)
      
      // 应用涨跌停限制（10%）
      const upperLimit = currentStockPrice * 1.1
      const lowerLimit = currentStockPrice * 0.9
      
      const finalMaxPrice = Math.min(maxStockPrice, upperLimit)
      const finalMinPrice = Math.max(minStockPrice, lowerLimit, 0.01)
      
      // 计算当天的累计偏离值范围（用于显示）
      const currentStockCumChange = (referenceStockPrice / baseStockPrice - 1) * 100
      const currentIndexCumChange = (referenceIndexPrice / baseIndexPrice - 1) * 100
      const currentDeviation = currentStockCumChange - currentIndexCumChange
      
      newPredictions.push({
        day: days[i],
        minPrice: Math.round(finalMinPrice * 100) / 100,
        maxPrice: Math.round(finalMaxPrice * 100) / 100,
        indexMin: Math.round(indexMinPrice * 100) / 100,
        indexMax: Math.round(indexMaxPrice * 100) / 100,
        baseStockPrice: Math.round(baseStockPrice * 100) / 100,
        baseIndexPrice: Math.round(baseIndexPrice * 100) / 100,
        currentDeviation: Math.round(currentDeviation * 100) / 100
      })
      
      // 更新下一天的当前价格（假设取中间值作为预估）
      currentStockPrice = (finalMaxPrice + finalMinPrice) / 2
      currentIndexPrice = (indexMaxPrice + indexMinPrice) / 2
    }
    
    setPredictions(newPredictions)
  }, [])
  
  // 当波动率变化时重新计算
  const handleVolatilityChange = (value: number[]) => {
    setIndexVolatility(value)
    if (data) {
      calculatePredictions(data, value[0])
    }
  }

  const computedSafeRanges: SafeRange[] = data ? (() => {
    const latestIndexPrice = data.latestIndexPrice
    const assumedIndexPrice = indexAssumption === 'fixed'
      ? Number(assumedIndexValue) || latestIndexPrice
      : indexAssumption === 'percent'
        ? latestIndexPrice * (1 + (Number(assumedIndexValue) || 0) / 100)
        : latestIndexPrice

    return [0, 1, 2].map((i) => {
      const baseS = data.stockData[i]?.close
      const baseI = data.indexData[i]?.close
      if (baseS == null || baseI == null) {
        return { date: '', baseStock: 0, baseIndex: 0, minSafe: 0, maxSafe: 0 }
      }
      const ratio = assumedIndexPrice / baseI
      const maxSafe = Math.round(baseS * (ratio + 2) * 100) / 100
      const minSafe = Math.round(Math.max(0.01, baseS * (ratio - 2)) * 100) / 100
      return {
        date: data.stockData[i].date,
        baseStock: baseS,
        baseIndex: baseI,
        minSafe,
        maxSafe
      }
    })
  })() : []
  
  // 格式化图表数据
  const getChartData = () => {
    if (!data) return []
    
    return data.deviations.map((d, index) => ({
      date: d.date.slice(5), // 只显示月-日
      stockPrice: d.stockPrice,
      indexPrice: data.indexData[index]?.close || 0,
      stockChange: d.stockChange,
      indexChange: d.indexChange,
      deviation: d.deviation,
      stockCumulativeChange: d.stockCumulativeChange,
      indexCumulativeChange: d.indexCumulativeChange,
      cumulativeDeviation: d.cumulativeDeviation
    }))
  }
  
  // 归一化价格数据用于对比
  const getNormalizedChartData = () => {
    if (!data || data.stockData.length === 0) return []
    
    const baseStock = data.stockData[0].close
    const baseIndex = data.indexData[0].close
    
    return data.stockData.map((stock, index) => ({
      date: stock.date.slice(5),
      stockNormalized: ((stock.close / baseStock) - 1) * 100,
      indexNormalized: ((data.indexData[index]?.close / baseIndex) - 1) * 100,
      stockPrice: stock.close,
      indexPrice: data.indexData[index]?.close
    }))
  }
  
  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 头部 */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Activity className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                A股偏离分析工具
              </h1>
              <p className="text-muted-foreground text-sm">
                分析股票相对指数的30日偏离值，预测安全价格区间
              </p>
            </div>
          </div>
          
          {/* 搜索栏 */}
          <Card className="border-border bg-card">
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <Input
                    placeholder="输入股票代码，如 600519、000001、300750"
                    value={stockCode}
                    onChange={(e) => setStockCode(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && fetchData()}
                    className="bg-input border-border text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                <Button 
                  onClick={() => fetchData()} 
                  disabled={loading}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                      分析中...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Search className="w-4 h-4" />
                      开始分析
                    </span>
                  )}
                </Button>
              </div>
              {error && (
                <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                  {error}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        
        {data && (
          <>
            {/* 概览卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardDescription className="text-muted-foreground">股票信息</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-foreground">{data.stockName}</span>
                    <Badge variant="outline" className="text-xs border-border">
                      {data.market} {data.stockCode}
                    </Badge>
                  </div>
                  <div className="text-3xl font-bold text-primary mt-1">
                    ¥{data.latestStockPrice.toFixed(2)}
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardDescription className="text-muted-foreground">对标指数</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-foreground">{data.indexName}</span>
                    <Badge variant="outline" className="text-xs border-border">
                      {data.indexCode}
                    </Badge>
                  </div>
                  <div className="text-3xl font-bold text-chart-4 mt-1">
                    {data.latestIndexPrice.toFixed(2)}
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardDescription className="text-muted-foreground">30日累计偏离值</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    {data.totalDeviation >= 0 ? (
                      <TrendingUp className="w-6 h-6 text-chart-1" />
                    ) : (
                      <TrendingDown className="w-6 h-6 text-chart-2" />
                    )}
                    <span className={`text-3xl font-bold ${data.totalDeviation >= 0 ? 'text-chart-1' : 'text-chart-2'}`}>
                      {data.totalDeviation >= 0 ? '+' : ''}{data.totalDeviation.toFixed(2)}%
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    = 股票累计涨跌幅 - 指数累计涨跌幅
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    距±200%阈值: {(200 - Math.abs(data.totalDeviation)).toFixed(2)}%
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardDescription className="text-muted-foreground">异动风险</CardDescription>
                </CardHeader>
                <CardContent>
                  {Math.abs(data.totalDeviation) >= 150 ? (
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-6 h-6 text-chart-2" />
                      <span className="text-2xl font-bold text-chart-2">高风险</span>
                    </div>
                  ) : Math.abs(data.totalDeviation) >= 100 ? (
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-6 h-6 text-primary" />
                      <span className="text-2xl font-bold text-primary">中等风险</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-chart-1">正常范围</span>
                    </div>
                  )}
                  <div className="mt-2 w-full bg-secondary rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full transition-all ${
                        Math.abs(data.totalDeviation) >= 150 ? 'bg-chart-2' : 
                        Math.abs(data.totalDeviation) >= 100 ? 'bg-primary' : 'bg-chart-1'
                      }`}
                      style={{ width: `${Math.min(Math.abs(data.totalDeviation) / 2, 100)}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {/* 图表区域 */}
            <Tabs defaultValue="price" className="w-full">
              <TabsList className="bg-secondary border-border">
                <TabsTrigger value="price" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <BarChart3 className="w-4 h-4 mr-2" />
                  价格走势
                </TabsTrigger>
                <TabsTrigger value="deviation" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <Activity className="w-4 h-4 mr-2" />
                  偏离分析
                </TabsTrigger>
                <TabsTrigger value="prediction" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <Calculator className="w-4 h-4 mr-2" />
                  价格预测
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="price">
                <Card className="bg-card border-border">
                  <CardHeader>
                    <CardTitle className="text-foreground">30日价格走势对比（归一化）</CardTitle>
                    <CardDescription className="text-muted-foreground">
                      以第一天为基准，对比股票与指数的相对涨跌幅（左轴：股票，右轴：指数）
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-80 md:h-96">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={getNormalizedChartData()} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                          <YAxis 
                            yAxisId="left"
                            stroke="hsl(var(--primary))" 
                            fontSize={12} 
                            tickFormatter={(v) => `${v.toFixed(0)}%`}
                            label={{ value: '股票涨跌幅', angle: -90, position: 'insideLeft', style: { fill: 'hsl(var(--primary))' } }}
                          />
                          <YAxis 
                            yAxisId="right"
                            orientation="right"
                            stroke="hsl(var(--chart-4))" 
                            fontSize={12} 
                            tickFormatter={(v) => `${v.toFixed(1)}%`}
                            label={{ value: '指数涨跌幅', angle: 90, position: 'insideRight', style: { fill: 'hsl(var(--chart-4))' } }}
                          />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--card))', 
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px',
                              color: 'hsl(var(--foreground))'
                            }}
                            formatter={(value: number, name: string) => [
                              `${value.toFixed(2)}%`, 
                              name === 'stockNormalized' ? `${data.stockName}` : data.indexName
                            ]}
                          />
                          <Legend />
                          <ReferenceLine y={0} yAxisId="left" stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                          <Line 
                            yAxisId="left"
                            type="monotone" 
                            dataKey="stockNormalized" 
                            name={data.stockName}
                            stroke="hsl(var(--primary))" 
                            strokeWidth={2}
                            dot={false}
                          />
                          <Line 
                            yAxisId="right"
                            type="monotone" 
                            dataKey="indexNormalized" 
                            name={data.indexName}
                            stroke="hsl(var(--chart-4))" 
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="deviation">
                <Card className="bg-card border-border">
                  <CardHeader>
                    <CardTitle className="text-foreground">累计涨跌幅与偏离值</CardTitle>
                    <CardDescription className="text-muted-foreground">
                      30日偏离 = 股票累计涨跌幅 - 指数累计涨跌幅（左轴：股票/偏离，右轴：指数）
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-80 md:h-96">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={getChartData()} margin={{ top: 5, right: 60, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                          <YAxis 
                            yAxisId="left" 
                            stroke="hsl(var(--muted-foreground))" 
                            fontSize={12} 
                            tickFormatter={(v) => `${v.toFixed(0)}%`}
                            domain={['auto', 'auto']}
                          />
                          <YAxis 
                            yAxisId="right" 
                            orientation="right" 
                            stroke="hsl(var(--chart-4))" 
                            fontSize={12} 
                            tickFormatter={(v) => `${v.toFixed(1)}%`}
                            domain={['auto', 'auto']}
                          />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--card))', 
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px',
                              color: 'hsl(var(--foreground))'
                            }}
                            formatter={(value: number, name: string) => {
                              const labels: Record<string, string> = {
                                stockCumulativeChange: '股票累计涨跌幅',
                                indexCumulativeChange: '指数累计涨跌幅',
                                cumulativeDeviation: '累计偏离值'
                              }
                              return [`${value.toFixed(2)}%`, labels[name] || name]
                            }}
                          />
                          <Legend />
                          <ReferenceLine y={0} yAxisId="left" stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                          <ReferenceLine y={200} yAxisId="left" stroke="hsl(var(--destructive))" strokeDasharray="5 5" label={{ value: "+200%", position: "left", fill: "hsl(var(--destructive))" }} />
                          <ReferenceLine y={-200} yAxisId="left" stroke="hsl(var(--destructive))" strokeDasharray="5 5" label={{ value: "-200%", position: "left", fill: "hsl(var(--destructive))" }} />
                          <Line 
                            yAxisId="left"
                            type="monotone" 
                            dataKey="stockCumulativeChange" 
                            name="股票累计涨跌幅"
                            stroke="hsl(var(--primary))" 
                            strokeWidth={2}
                            dot={false}
                          />
                          <Line 
                            yAxisId="right"
                            type="monotone" 
                            dataKey="indexCumulativeChange" 
                            name="指数累计涨跌幅"
                            stroke="hsl(var(--chart-4))" 
                            strokeWidth={2}
                            dot={false}
                          />
                          <Line 
                            yAxisId="left"
                            type="monotone" 
                            dataKey="cumulativeDeviation" 
                            name="累计偏离值"
                            stroke="hsl(var(--chart-1))" 
                            strokeWidth={3}
                            dot={false}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="prediction">
                <Card className="bg-card border-border">
                  <CardHeader>
                    <CardTitle className="text-foreground">未来价���预测</CardTitle>
                    <CardDescription className="text-muted-foreground">
                      基于指数波动范围，预测在不触发200%异动前提下的股票安全价格区间
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-4">
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-foreground">
                            指数日涨跌幅范围: ±{indexVolatility[0]}%
                          </label>
                          <Badge variant="outline" className="border-border">
                            当前累计偏离: {data.totalDeviation.toFixed(2)}%
                          </Badge>
                        </div>
                        <Slider
                          value={indexVolatility}
                          onValueChange={handleVolatilityChange}
                          min={0.5}
                          max={10}
                          step={0.5}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>±0.5%</span>
                          <span>±5%</span>
                          <span>±10%</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">指数假设类型</div>
                            <Select value={indexAssumption} onValueChange={(value) => setIndexAssumption(value as 'unchanged' | 'fixed' | 'percent')}>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="选择假设类型" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unchanged">指数不变</SelectItem>
                                <SelectItem value="fixed">指定指数点位</SelectItem>
                                <SelectItem value="percent">指定指数涨跌幅</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-1 md:col-span-2">
                            <div className="text-xs text-muted-foreground mb-1">
                              {indexAssumption === 'fixed'
                                ? '指定指数点位'
                                : indexAssumption === 'percent'
                                  ? '指定指数涨跌幅（相对于当前点位）'
                                  : '使用当前上证指数不变'}
                            </div>
                            <Input
                              value={assumedIndexValue}
                              onChange={(e) => setAssumedIndexValue(e.target.value)}
                              type="number"
                              disabled={indexAssumption === 'unchanged'}
                              placeholder={indexAssumption === 'fixed' ? '例如 4077.28' : '例如 0.5'}
                              className="w-full bg-input border-border text-foreground placeholder:text-muted-foreground"
                            />
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          当前指数假设: {indexAssumption === 'fixed' ? `${Number(assumedIndexValue || 0).toFixed(2)} 点` : indexAssumption === 'percent' ? `${Number(assumedIndexValue || 0).toFixed(2)}%` : '当前指数不变'}
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {predictions.map((pred, index) => (
                        <Card key={index} className="bg-secondary border-border">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-lg text-foreground">{pred.day}</CardTitle>
                            <CardDescription className="text-xs">
                              30日基准: 股票 ¥{pred.baseStockPrice} / 指数 {pred.baseIndexPrice}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">股票安全价格区间</div>
                              <div className="flex items-center gap-2">
                                <span className="text-chart-2 font-mono text-lg font-bold">¥{pred.minPrice.toFixed(2)}</span>
                                <span className="text-muted-foreground">~</span>
                                <span className="text-chart-1 font-mono text-lg font-bold">¥{pred.maxPrice.toFixed(2)}</span>
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">指数预期范围</div>
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-chart-4 font-mono">{pred.indexMin.toFixed(2)}</span>
                                <span className="text-muted-foreground">~</span>
                                <span className="text-chart-4 font-mono">{pred.indexMax.toFixed(2)}</span>
                              </div>
                            </div>
                            <div className="pt-2 border-t border-border space-y-1">
                              <div className="text-xs text-muted-foreground">
                                当前累计偏离: <span className={pred.currentDeviation >= 0 ? 'text-chart-1' : 'text-chart-2'}>{pred.currentDeviation >= 0 ? '+' : ''}{pred.currentDeviation}%</span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                距±200%阈值: {(200 - Math.abs(pred.currentDeviation)).toFixed(2)}%
                              </div>
                            </div>
                            {/* 显示后端返回的基准日期与临界值（如果可用） */}
                            {(() => {
                              const sr = computedSafeRanges[index]
                              if (!sr) return null
                              const criticalPrice = sr.maxSafe
                              const criticalCum = Math.round(((criticalPrice / sr.baseStock - 1) * 100) * 100) / 100
                              const todayClose = data?.latestStockPrice || 0
                              const needChange = todayClose > 0 ? Math.round(((criticalPrice / todayClose - 1) * 100) * 100) / 100 : 0
                              return (
                                <div className="pt-2 border-t border-border space-y-1 text-xs text-muted-foreground">
                                  <div>基准日期: {sr.date}</div>
                                  <div>临界上限价: ¥{criticalPrice.toFixed(2)}（临界涨幅: {criticalCum >= 0 ? '+' : ''}{criticalCum}%）</div>
                                  <div>以今日收盘计需变动: {needChange >= 0 ? '+' : ''}{needChange}%</div>
                                </div>
                              )
                            })()}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                    
                    <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-primary mt-0.5" />
                        <div className="text-sm text-muted-foreground">
                          <p className="font-medium text-foreground mb-1">计算说明</p>
                          <p>
                            30日200%严重异动是指股票相对指数的累计偏离值达到±200%。
                            <strong>重要：30日窗口会随时间滑动</strong>，明天的基准价是今天窗口中的第2天（D-29），
                            后天的基准价是第3天（D-28）。当基准价变化时，累计偏离值会重新计算。
                            预测基于设定的指数波动范围，计算股票在不触发异动前提下的安全价格区间。
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
            
            {/* 详细数据表格 */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground">30日详细数据</CardTitle>
                <CardDescription className="text-muted-foreground">
                  累计涨跌幅以30日前价格为基准计算，累计偏离 = 股票累计涨跌幅 - 指数累计涨跌幅
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-secondary/50">
                        <TableHead className="text-muted-foreground">日期</TableHead>
                        <TableHead className="text-muted-foreground text-right">股票价格</TableHead>
                        <TableHead className="text-muted-foreground text-right">股票累计涨跌</TableHead>
                        <TableHead className="text-muted-foreground text-right">指数点位</TableHead>
                        <TableHead className="text-muted-foreground text-right">指数累计涨跌</TableHead>
                        <TableHead className="text-muted-foreground text-right">累计偏离值</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.deviations.map((row, index) => (
                        <TableRow key={index} className="border-border hover:bg-secondary/50">
                          <TableCell className="text-foreground font-mono">{row.date}</TableCell>
                          <TableCell className="text-right text-foreground font-mono">
                            ¥{row.stockPrice.toFixed(2)}
                          </TableCell>
                          <TableCell className={`text-right font-mono ${row.stockCumulativeChange >= 0 ? 'text-chart-1' : 'text-chart-2'}`}>
                            {row.stockCumulativeChange >= 0 ? '+' : ''}{row.stockCumulativeChange.toFixed(2)}%
                          </TableCell>
                          <TableCell className="text-right text-foreground font-mono">
                            {row.indexPrice.toFixed(2)}
                          </TableCell>
                          <TableCell className={`text-right font-mono ${row.indexCumulativeChange >= 0 ? 'text-chart-1' : 'text-chart-2'}`}>
                            {row.indexCumulativeChange >= 0 ? '+' : ''}{row.indexCumulativeChange.toFixed(2)}%
                          </TableCell>
                          <TableCell className={`text-right font-mono font-bold ${row.cumulativeDeviation >= 0 ? 'text-chart-1' : 'text-chart-2'}`}>
                            {row.cumulativeDeviation >= 0 ? '+' : ''}{row.cumulativeDeviation.toFixed(2)}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
        
        {/* 使用说明 */}
        {!data && !loading && (
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground">使用说明</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-medium text-foreground mb-2">支持的股票代码</h3>
                  <ul className="space-y-1 text-sm">
                    <li>• 沪市主板: 600xxx、601xxx、603xxx</li>
                    <li>• 沪市科创板: 688xxx</li>
                    <li>• 深市主板: 000xxx、001xxx</li>
                    <li>• 深市创业板: 300xxx、301xxx</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-medium text-foreground mb-2">功能说明</h3>
                  <ul className="space-y-1 text-sm">
                    <li>• 自动识别沪深市场并匹配对应指数</li>
                    <li>• 计算股票与指数的30日偏离值</li>
                    <li>• 基于偏离值预测安全价格区间</li>
                    <li>• 可调节指数波动范围进行模拟</li>
                  </ul>
                </div>
              </div>
              
              <div className="p-4 bg-secondary rounded-lg">
                <h3 className="font-medium text-foreground mb-2">30日偏离值计算公式</h3>
                <div className="text-sm space-y-2">
                  <p>
                    <span className="font-mono bg-background px-2 py-1 rounded">30日累计偏离值 = 股票30日累计涨跌幅 - 指数30日累计涨跌幅</span>
                  </p>
                  <p>其中：</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>股票30日累计涨跌幅 = (今日收盘价 / 30日前收盘价 - 1) × 100%</li>
                    <li>指数30日累计涨跌幅 = (今日指数 / 30日前指数 - 1) × 100%</li>
                  </ul>
                  <p className="mt-2 text-muted-foreground">
                    当累计偏离值达到±200%时，会被认定为严重异动，可能触发监管关注或交易限制。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
