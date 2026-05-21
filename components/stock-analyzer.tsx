'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Search, TrendingUp, TrendingDown, AlertTriangle, Activity } from 'lucide-react'

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
  realtimeStockPrice: number
  realtimeIndexPrice: number
  realtimeTotalDeviation: number
  latestStockPrice: number
  latestIndexPrice: number
  stockInfo: {
    name: string
    open: number
    lastClose: number
    current: number | null
    high: number
    low: number
  } | null
  dateRange: DateRange
  baseStockPrice: number
  baseIndexPrice: number
  safeRanges?: SafeRange[]
  historicalDeviations?: HistoricalDeviation[]
}

type RecentStock = {
  code: string
  name: string
}

interface SafeRange {
  date: string
  baseStock: number
  baseIndex: number
  minSafe: number
  maxSafe: number
}

interface HistoricalDeviation {
  date: string
  stockPrice: number
  high: number
  low: number
  indexPrice: number
  dailyChange: number
  intradayHighChange: number
  stockCumulativeChange: number
  indexCumulativeChange: number
  cumulativeDeviation: number
  daysAgo: number
  baseDate: string
  baseStockPrice: number
  safeMax: number
  ma5: number
  lowDeviationFromMa5: number
  nearSafeMax: boolean
  suspectControl: boolean
  lostControl: boolean
  outOfControl: boolean
}

export default function StockAnalyzer() {
  const [stockCode, setStockCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<StockData | null>(null)
  const [offsetDays, setOffsetDays] = useState('0') // 0=今天, 1=昨天, 2=前天...
  const [indexChangeInput, setIndexChangeInput] = useState('0')
  const [recentStocks, setRecentStocks] = useState<RecentStock[]>([])

  const STORAGE_KEY = 'stock-analyzer-recent'

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as RecentStock[]
        setRecentStocks(Array.isArray(parsed) ? parsed : [])
      }
    } catch {
      setRecentStocks([])
    }
  }, [])

  const saveRecentStocks = (stocks: RecentStock[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stocks))
    } catch {
      // ignore storage failure
    }
  }

  const addRecentStock = (code: string, name: string) => {
    const normalized = code.replace(/^(sh|sz|SH|SZ)/, '')
    const next: RecentStock[] = [{ code: normalized, name }, ...recentStocks.filter((item) => item.code !== normalized)]
      .slice(0, 8)
    setRecentStocks(next)
    saveRecentStocks(next)
  }

  const handleRecentSelect = (code: string) => {
    setStockCode(code)
    fetchData(offsetDays, code)
  }

  const fetchData = useCallback(async (offset: string = offsetDays, code: string = stockCode) => {
    if (!code.trim()) {
      setError('请输入股票代码')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/stock?code=${encodeURIComponent(code.trim())}&offset=${offset}`)
      const result = await response.json()

      if (!response.ok) {
        setError(result.error || '获取数据失败')
        setData(null)
        return
      }

      setData(result)
      addRecentStock(result.stockCode, result.stockName || result.stockInfo?.name || code)
    } catch {
      setError('网络错误，请稍后重试')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [stockCode, offsetDays])

  const safeRanges = data?.safeRanges || []
  function formatTradingDate(yyyymmdd: string) {
    if (!yyyymmdd) return ''
    try {
      // 支持格式：YYYYMMDD, YYYY-MM-DD, YYYY/MM/DD, 可选时间部分 'YYYY-MM-DD HH:mm:ss'
      const m = yyyymmdd.match(/(\d{4})[-/]?(\d{2})[-/]?(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/) 
      if (!m) return yyyymmdd
      const year = parseInt(m[1], 10)
      const month = parseInt(m[2], 10)
      const day = parseInt(m[3], 10)
      const hour = m[4] ? parseInt(m[4], 10) : 0
      const minute = m[5] ? parseInt(m[5], 10) : 0
      const second = m[6] ? parseInt(m[6], 10) : 0

      // 使用 UTC 构造时间，避免本地时区导致前一天/后一天的问题
      const dt = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
      const weekdays = ['日', '一', '二', '三', '四', '五', '六']
      const datePart = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const timePart = (hour || minute || second) ? ` ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` : ''
      return `${datePart}${timePart}（周${weekdays[dt.getUTCDay()]}）`
    } catch {
      return yyyymmdd
    }
  }
  function relativeLabel(idx: number) {
    switch (idx) {
      case 0:
        return '今天'
      case 1:
        return '明天'
      case 2:
        return '后天'
      case 3:
        return '大后天'
      default:
        return `D+${idx}`
    }
  }
  function agColorClass(value: number | null | undefined, fallback = 'text-muted-foreground') {
    if (value == null || Number.isNaN(value)) return fallback
    return value >= 0 ? 'text-red-600' : 'text-green-600'
  }
  function getNextTradingDates(count: number) {
    // 如果服务端返回了交易日日历，优先使用它
    const serverCalendar = (data as any)?.tradingCalendar as string[] | undefined
    if (Array.isArray(serverCalendar) && serverCalendar.length >= count) {
      return serverCalendar.slice(0, count)
    }

    const out: string[] = []
    const today = new Date()
    // 从本地时间的今天开始，向前寻找未来的交易日（仅排除周末），如果遇到节假日不能识别则仍会包含
    let dt = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    while (out.length < count) {
      const day = dt.getDay()
      if (day !== 0 && day !== 6) {
        const y = dt.getFullYear()
        const m = String(dt.getMonth() + 1).padStart(2, '0')
        const d = String(dt.getDate()).padStart(2, '0')
        out.push(`${y}${m}${d}`)
      }
      dt.setDate(dt.getDate() + 1)
    }
    return out
  }
  const displayStockName = data?.stockName || data?.stockInfo?.name || data?.stockCode || stockCode || '未知'
  const currentPrice = data ? (data.realtimeStockPrice > 0 ? data.realtimeStockPrice : data.latestStockPrice) : 0
  const parsedIndexChange = parseFloat(indexChangeInput)
  const indexChangeFactor = Number.isFinite(parsedIndexChange) ? 1 + parsedIndexChange / 100 : 1
  
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
              {recentStocks.length > 0 && (
                <div className="mt-4">
                  <div className="text-sm text-muted-foreground mb-2">快捷查询</div>
                  <div className="flex flex-wrap gap-2">
                    {recentStocks.map((item) => (
                      <button
                        key={item.code}
                        type="button"
                        onClick={() => handleRecentSelect(item.code)}
                        className="rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground transition hover:border-primary hover:text-primary"
                      >
                        {item.code}{item.name ? ` · ${item.name}` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )}
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
                    <span className="text-2xl font-bold text-foreground">{displayStockName}</span>
                    <Badge variant="outline" className="text-xs border-border">
                      {data.market} {data.stockCode}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {data.stockInfo?.name ? `实时行情：${data.stockInfo.name}` : '暂无实时股票名称，已显示代码'}
                  </div>
                  <div className="text-3xl font-bold text-primary mt-2">
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
                      <TrendingUp className="w-6 h-6 text-red-600" />
                    ) : (
                      <TrendingDown className="w-6 h-6 text-green-600" />
                    )}
                    <span className={`text-3xl font-bold ${agColorClass(data.totalDeviation)}`}>
                      {data.totalDeviation >= 0 ? '+' : ''}{data.totalDeviation.toFixed(2)}%
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    = 股票累计涨跌幅 - 指数累计涨跌幅
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    距±200%阈值: {(200 - Math.abs(data.totalDeviation)).toFixed(2)}%
                  </div>
                  <div className="mt-3 space-y-2 text-sm text-muted-foreground border-t border-border pt-3">
                    <div>实时股票价: ¥{data.realtimeStockPrice.toFixed(2)}</div>
                    <div>实时指数价: {data.realtimeIndexPrice.toFixed(2)}</div>
                    <div>实时30日偏离: <span className={agColorClass(data.realtimeTotalDeviation)}>{data.realtimeTotalDeviation >= 0 ? '+' : ''}{data.realtimeTotalDeviation.toFixed(2)}%</span></div>
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
            
            {/* 过去14天偏离追踪 */}
            {data.historicalDeviations && data.historicalDeviations.length > 0 && (
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-foreground">过去14个交易日偏离追踪</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    追踪最近14个交易日的累计偏离值变化，帮助判断从第几天开始进入异动监控区间
                  </CardDescription>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="p-2 rounded border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30">
                      <span className="font-semibold text-red-700 dark:text-red-400">🔴 触及上限：</span>
                      <span className="text-muted-foreground">当日最高价 ≥ 安全上限 × 97%，说明盘中已接近异动触发线</span>
                    </div>
                    <div className="p-2 rounded border border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/30">
                      <span className="font-semibold text-orange-700 dark:text-orange-400">🟠 疑似控盘：</span>
                      <span className="text-muted-foreground">触及上限且最高价比收盘价高 ≥ 3%，盘中冲高后被打压回收盘</span>
                    </div>
                    <div className="p-2 rounded border border-purple-200 bg-purple-50 dark:border-purple-900 dark:bg-purple-950/30">
                      <span className="font-semibold text-purple-700 dark:text-purple-400">🟣 不控盘：</span>
                      <span className="text-muted-foreground">最低价偏离5日线 ≥ 3%，说明下方支撑丢失，控盘力度不足</span>
                    </div>
                    <div className="p-2 rounded border border-red-300 bg-red-100 dark:border-red-800 dark:bg-red-950/40">
                      <span className="font-semibold text-red-800 dark:text-red-300">⚫ 失控：</span>
                      <span className="text-muted-foreground">最低价偏离5日线 ≥ 10%，已脱离趋势，不在控盘范围内</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border hover:bg-secondary/50">
                          <TableHead className="text-muted-foreground">日期</TableHead>
                          <TableHead className="text-muted-foreground text-center">T-N</TableHead>
                          <TableHead className="text-muted-foreground">基准日期</TableHead>
                          <TableHead className="text-muted-foreground text-right">基准股票价</TableHead>
                          <TableHead className="text-muted-foreground text-right">最高价</TableHead>
                          <TableHead className="text-muted-foreground text-right">安全上限</TableHead>
                          <TableHead className="text-muted-foreground text-right">收盘价</TableHead>
                          <TableHead className="text-muted-foreground text-right">涨跌幅</TableHead>
                          <TableHead className="text-muted-foreground text-right">盘中最高涨幅</TableHead>
                          <TableHead className="text-muted-foreground text-right">最低价</TableHead>
                          <TableHead className="text-muted-foreground text-right">5日线</TableHead>
                          <TableHead className="text-muted-foreground text-right">低偏离MA5%</TableHead>
                          <TableHead className="text-muted-foreground text-right">累计偏离值</TableHead>
                          <TableHead className="text-muted-foreground text-center">信号</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.historicalDeviations.map((row) => {
                          const isWarning = Math.abs(row.cumulativeDeviation) >= 150
                          const isDanger = Math.abs(row.cumulativeDeviation) >= 200
                          return (
                            <TableRow key={row.date} className={`border-border hover:bg-secondary/50 ${row.nearSafeMax ? 'bg-destructive/10' : isDanger ? 'bg-destructive/5' : isWarning ? 'bg-yellow-500/5' : ''}`}>
                              <TableCell className="text-foreground font-mono">{formatTradingDate(row.date)}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline" className="text-xs">
                                  {row.daysAgo === 0 ? '最新' : `T-${row.daysAgo}`}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-foreground font-mono text-sm">{row.baseDate}</TableCell>
                              <TableCell className="text-right text-foreground font-mono">¥{row.baseStockPrice.toFixed(2)}</TableCell>
                              <TableCell className={`text-right font-mono ${row.suspectControl ? 'text-orange-600 font-bold' : 'text-foreground'}`}>
                                ¥{row.high.toFixed(2)}
                              </TableCell>
                              <TableCell className={`text-right font-mono ${row.nearSafeMax ? 'text-red-600 font-bold' : 'text-foreground'}`}>
                                ¥{row.safeMax.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right text-foreground font-mono">¥{row.stockPrice.toFixed(2)}</TableCell>
                              <TableCell className={`text-right font-mono ${agColorClass(row.dailyChange)}`}>
                                {row.dailyChange >= 0 ? '+' : ''}{row.dailyChange.toFixed(2)}%
                              </TableCell>
                              <TableCell className={`text-right font-mono ${agColorClass(row.intradayHighChange)}`}>
                                {row.intradayHighChange >= 0 ? '+' : ''}{row.intradayHighChange.toFixed(2)}%
                              </TableCell>
                              <TableCell className={`text-right font-mono ${row.lostControl ? 'text-purple-600 font-bold' : 'text-foreground'}`}>
                                ¥{row.low.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground font-mono">¥{row.ma5.toFixed(2)}</TableCell>
                              <TableCell className={`text-right font-mono ${row.lostControl ? 'text-purple-600 font-bold' : row.lowDeviationFromMa5 > 0 ? 'text-yellow-600' : 'text-muted-foreground'}`}>
                                {row.lowDeviationFromMa5 > 0 ? '+' : ''}{row.lowDeviationFromMa5.toFixed(2)}%
                              </TableCell>
                              <TableCell className={`text-right font-mono font-bold ${agColorClass(row.cumulativeDeviation)}`}>
                                {row.cumulativeDeviation >= 0 ? '+' : ''}{row.cumulativeDeviation.toFixed(2)}%
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex flex-col gap-1 items-center">
                                  {row.nearSafeMax && (
                                    <Badge variant="destructive" className="text-xs whitespace-nowrap">触及上限</Badge>
                                  )}
                                  {row.suspectControl && (
                                    <Badge className="text-xs bg-orange-500/20 text-orange-700 border-orange-500/30 whitespace-nowrap">疑似控盘</Badge>
                                  )}
                                  {row.outOfControl && (
                                    <Badge className="text-xs bg-red-700/20 text-red-900 border-red-700/30 whitespace-nowrap dark:text-red-300">失控</Badge>
                                  )}
                                  {row.lostControl && !row.outOfControl && (
                                    <Badge className="text-xs bg-purple-500/20 text-purple-700 border-purple-500/30 whitespace-nowrap">不控盘</Badge>
                                  )}
                                  {!row.nearSafeMax && !row.suspectControl && !row.lostControl && (
                                    isDanger ? (
                                      <Badge variant="destructive" className="text-xs">异动</Badge>
                                    ) : isWarning ? (
                                      <Badge className="text-xs bg-yellow-500/20 text-yellow-700 border-yellow-500/30">接近</Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-xs text-muted-foreground">正常</Badge>
                                    )
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground">服务端安全临界</CardTitle>
                <CardDescription className="text-muted-foreground">
                  以下数值来自服务端计算，仅保留服务端临界结果，前端不再重复计算安全区间。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="text-sm text-muted-foreground">指数涨跌幅</div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-2">
                      <Input
                        type="number"
                        step="0.1"
                        min="-10"
                        max="10"
                        value={indexChangeInput}
                        onChange={(e) => setIndexChangeInput(e.target.value)}
                        placeholder="输入指数涨跌幅"
                        className="w-full sm:w-40 bg-input border-border text-foreground focus-visible:ring-primary/40 focus-visible:border-primary"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      指数涨跌幅范围 -10% 到 10%，步长 0.1%。
                    </div>
                  </div>
                </div>
                {safeRanges.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border hover:bg-secondary/50">
                          <TableHead className="text-muted-foreground">交易日</TableHead>
                          <TableHead className="text-muted-foreground">基准日期</TableHead>
                          <TableHead className="text-muted-foreground text-right">基准股票价</TableHead>
                          <TableHead className="text-muted-foreground text-right">基准指数价</TableHead>
                          <TableHead className="text-muted-foreground text-right">未来指数价</TableHead>
                          <TableHead className="text-muted-foreground text-right">安全上限</TableHead>
                          <TableHead className="text-muted-foreground text-right">安全上限较上日涨跌%</TableHead>
                          <TableHead className="text-muted-foreground text-right">较实时报价涨跌</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {safeRanges.map((item, index) => {
                          const adjustedIndexPrice = (data?.realtimeIndexPrice > 0 ? data.realtimeIndexPrice : data.latestIndexPrice) * indexChangeFactor
                          const adjustedRatio = item.baseIndex > 0 ? adjustedIndexPrice / item.baseIndex : 1
                          const adjustedMaxSafe = item.baseStock * (adjustedRatio + 2)
                          const change = currentPrice ? ((adjustedMaxSafe / currentPrice - 1) * 100) : 0

                          let prevAdjustedMax: number | null = null
                          if (index > 0) {
                            const prev = safeRanges[index - 1]
                            const prevAdjustedIndexPrice = (data?.realtimeIndexPrice > 0 ? data.realtimeIndexPrice : data.latestIndexPrice) * indexChangeFactor
                            const prevAdjustedRatio = prev.baseIndex > 0 ? prevAdjustedIndexPrice / prev.baseIndex : 1
                            prevAdjustedMax = prev.baseStock * (prevAdjustedRatio + 2)
                          }
                          const dayToDayChange = prevAdjustedMax ? ((adjustedMaxSafe - prevAdjustedMax) / prevAdjustedMax) * 100 : null

                          const upperColorClass = adjustedMaxSafe > currentPrice ? 'text-red-600' : 'text-green-600'

                          return (
                            <TableRow key={`${item.date}-${index}`} className="border-border hover:bg-secondary/50">
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  <div>{formatTradingDate(getNextTradingDates(safeRanges.length)[index] || item.date)}</div>
                                  <Badge variant="outline" className="text-xs">{relativeLabel(index)}</Badge>
                                </div>
                              </TableCell>
                              <TableCell className="font-mono">{item.date}</TableCell>
                              <TableCell className="text-right font-mono text-foreground">¥{item.baseStock.toFixed(2)}</TableCell>
                              <TableCell className="text-right font-mono text-foreground">{item.baseIndex.toFixed(2)}</TableCell>
                              <TableCell className="text-right font-mono text-foreground">{adjustedIndexPrice.toFixed(2)}</TableCell>
                              <TableCell className={`text-right font-mono ${upperColorClass}`}>¥{adjustedMaxSafe.toFixed(2)}</TableCell>
                              <TableCell className={`text-right font-mono ${dayToDayChange !== null ? agColorClass(dayToDayChange) : 'text-muted-foreground'}`}>
                                {dayToDayChange !== null ? `${dayToDayChange >= 0 ? '+' : ''}${dayToDayChange.toFixed(2)}%` : '—'}
                              </TableCell>
                              <TableCell className={`text-right font-mono ${agColorClass(change)}`}>
                                {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    暂无服务端临界值数据。
                  </div>
                )}
              </CardContent>
            </Card>
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
                          <TableCell className={`text-right font-mono ${agColorClass(row.stockCumulativeChange)}`}>
                            {row.stockCumulativeChange >= 0 ? '+' : ''}{row.stockCumulativeChange.toFixed(2)}%
                          </TableCell>
                          <TableCell className="text-right text-foreground font-mono">
                            {row.indexPrice.toFixed(2)}
                          </TableCell>
                          <TableCell className={`text-right font-mono ${agColorClass(row.indexCumulativeChange)}`}>
                            {row.indexCumulativeChange >= 0 ? '+' : ''}{row.indexCumulativeChange.toFixed(2)}%
                          </TableCell>
                          <TableCell className={`text-right font-mono font-bold ${agColorClass(row.cumulativeDeviation)}`}>
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
