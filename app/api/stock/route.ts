import { NextRequest, NextResponse } from 'next/server'

// 判断股票市场
function getMarketInfo(stockCode: string): { market: 'sh' | 'sz'; indexCode: string; indexName: string } | null {
  const code = stockCode.replace(/^(sh|sz|SH|SZ)/, '')
  
  // 沪市: 60开头的主板, 68开头的科创板
  if (code.startsWith('60') || code.startsWith('68')) {
    return { market: 'sh', indexCode: '000001', indexName: '上证指数' }
  }
  // 深市: 00开头的主板, 30开头的创业板
  if (code.startsWith('00') || code.startsWith('30')) {
    return { market: 'sz', indexCode: '399001', indexName: '深证成指' }
  }
  return null
}

// 格式化日期
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0].replace(/-/g, '')
}

// 获取30天前的日期
function get30DaysAgo(): Date {
  const date = new Date()
  date.setDate(date.getDate() - 45) // 获取更多天数以确保有30个交易日
  return date
}

// 从新浪API获取股票数据
async function fetchStockData(stockCode: string, market: 'sh' | 'sz', datalen: number = 40) {
  const symbol = `${market}${stockCode.replace(/^(sh|sz|SH|SZ)/, '')}`
  
  // 使用新浪财经的日K线数据API，拉取更多数据以支持历史查询
  const url = `https://quotes.sina.cn/cn/api/jsonp_v2.php/var%20_s${symbol}=/CN_MarketDataService.getKLineData?symbol=${symbol}&scale=240&ma=no&datalen=${datalen}`
  
  try {
    const response = await fetch(url, {
      headers: {
        'Referer': 'https://finance.sina.com.cn',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    
    const text = await response.text()
    // 解析JSONP响应
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return null
    }
    
    const data = JSON.parse(jsonMatch[0])
    // 返回所有数据，不截取
    return data.map((item: { day: string; close: string; open: string; high: string; low: string; volume: string }) => ({
      date: item.day,
      close: parseFloat(item.close),
      open: parseFloat(item.open),
      high: parseFloat(item.high),
      low: parseFloat(item.low),
      volume: parseInt(item.volume)
    }))
  } catch (error) {
    console.error('Error fetching stock data:', error)
    return null
  }
}

// 从新浪API获取指数数据
async function fetchIndexData(indexCode: string, market: 'sh' | 'sz', datalen: number = 40) {
  const symbol = market === 'sh' ? `sh${indexCode}` : `sz${indexCode}`
  
  const url = `https://quotes.sina.cn/cn/api/jsonp_v2.php/var%20_s${symbol}=/CN_MarketDataService.getKLineData?symbol=${symbol}&scale=240&ma=no&datalen=${datalen}`
  
  try {
    const response = await fetch(url, {
      headers: {
        'Referer': 'https://finance.sina.com.cn',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    
    const text = await response.text()
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return null
    }
    
    const data = JSON.parse(jsonMatch[0])
    // 返回所有数据，不截取
    return data.map((item: { day: string; close: string; open: string; high: string; low: string }) => ({
      date: item.day,
      close: parseFloat(item.close),
      open: parseFloat(item.open),
      high: parseFloat(item.high),
      low: parseFloat(item.low)
    }))
  } catch (error) {
    console.error('Error fetching index data:', error)
    return null
  }
}

// 获取股票实时信息
async function fetchStockInfo(stockCode: string, market: 'sh' | 'sz') {
  const symbol = `${market}${stockCode.replace(/^(sh|sz|SH|SZ)/, '')}`
  const url = `https://hq.sinajs.cn/list=${symbol}`
  
  try {
    const response = await fetch(url, {
      headers: {
        'Referer': 'https://finance.sina.com.cn',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    
    const text = await response.text()
    const match = text.match(/"(.+)"/)
    if (!match) return null
    
    const parts = match[1].split(',')
    return {
      name: parts[0],
      open: parseFloat(parts[1]),
      lastClose: parseFloat(parts[2]),
      current: parseFloat(parts[3]),
      high: parseFloat(parts[4]),
      low: parseFloat(parts[5])
    }
  } catch (error) {
    console.error('Error fetching stock info:', error)
    return null
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const stockCode = searchParams.get('code')
  const offsetDays = parseInt(searchParams.get('offset') || '0') // 0=今天, 1=昨天, 2=前天...
  
  if (!stockCode) {
    return NextResponse.json({ error: '请输入股票代码' }, { status: 400 })
  }
  
  const marketInfo = getMarketInfo(stockCode)
  if (!marketInfo) {
    return NextResponse.json({ error: '无效的股票代码，请输入A股股票代码' }, { status: 400 })
  }
  
  // 拉取更多数据以支持历史查询（30天 + offset + 缓冲）
  const datalen = 35 + offsetDays + 5
  
  const [allStockData, allIndexData, stockInfo] = await Promise.all([
    fetchStockData(stockCode, marketInfo.market, datalen),
    fetchIndexData(marketInfo.indexCode, marketInfo.market, datalen),
    fetchStockInfo(stockCode, marketInfo.market)
  ])
  
  if (!allStockData || !allIndexData) {
    return NextResponse.json({ error: '获取数据失败，请稍后重试' }, { status: 500 })
  }
  
  // 根据offset截取31天数据，确保当前窗口的基准日是D-30
  // offset=0: 取最后31天 (slice(-31))
  // offset=1: 取倒数第2到第32天 (slice(-32, -1))
  // offset=2: 取倒数第3到第33天 (slice(-33, -2))
  const endIndex = offsetDays > 0 ? -offsetDays : undefined
  const startIndex = endIndex ? -(31 + offsetDays) : -31
  
  const stockData = endIndex ? allStockData.slice(startIndex, endIndex) : allStockData.slice(startIndex)
  const indexData = endIndex ? allIndexData.slice(startIndex, endIndex) : allIndexData.slice(startIndex)
  
  if (stockData.length < 31 || indexData.length < 31) {
    return NextResponse.json({ error: `数据不足，只有${stockData.length}天数据` }, { status: 400 })
  }
  
  // 基准价格（30日前的价格）
  const baseStockPrice = stockData[0]?.close || 1
  const baseIndexPrice = indexData[0]?.close || 1
  
  // 计算偏离值 - 使用正确的口径
  // 30日累计偏离 = 股票30日累计涨跌幅 - 指数30日累计涨跌幅
  // 股票30日累计涨跌幅 = (当日收盘价 / 30日前收盘价 - 1) × 100%
  // 指数30日累计涨跌幅 = (当日指数 / 30日前指数 - 1) × 100%
  const deviationsWithCumulative = stockData.map((stock: { date: string; close: number }, index: number) => {
    const indexItem = indexData[index]
    if (!indexItem) return null
    
    // 计算股票日涨跌幅（相对前一日）
    const prevStock = stockData[index - 1]
    const dailyStockChange = prevStock ? ((stock.close - prevStock.close) / prevStock.close) * 100 : 0
    
    // 计算指数日涨跌幅（相对前一日）
    const prevIndex = indexData[index - 1]
    const dailyIndexChange = prevIndex ? ((indexItem.close - prevIndex.close) / prevIndex.close) * 100 : 0
    
    // 每日偏离值（仅用于展示）
    const dailyDeviation = dailyStockChange - dailyIndexChange
    
    // 股票累计涨跌幅（相对30日前基准价）
    const stockCumulativeChange = ((stock.close - baseStockPrice) / baseStockPrice) * 100
    
    // 指数累计涨跌幅（相对30日前基准价）
    const indexCumulativeChange = ((indexItem.close - baseIndexPrice) / baseIndexPrice) * 100
    
    // 累计偏离值 = 股票累计涨跌幅 - 指数累计涨跌幅（正确口径）
    const cumulativeDeviation = stockCumulativeChange - indexCumulativeChange
    
    return {
      date: stock.date,
      stockPrice: stock.close,
      indexPrice: indexItem.close,
      stockChange: dailyStockChange,
      indexChange: dailyIndexChange,
      deviation: dailyDeviation,
      stockCumulativeChange,
      indexCumulativeChange,
      cumulativeDeviation
    }
  }).filter(Boolean)
  
  // 计算30日累计偏离值（最新一天的累计偏离值）
  const latestDeviation = deviationsWithCumulative[deviationsWithCumulative.length - 1]
  const totalDeviation = latestDeviation?.cumulativeDeviation || 0
  
  // 获取最新价格
  const latestStockPrice = stockData[stockData.length - 1]?.close || 0
  const latestIndexPrice = indexData[indexData.length - 1]?.close || 0

  // 计算未来三天（今天/明天/后天）在假设指数不变下的安全价格区间
  // 简化公式推导：
  // allowedMaxStock = baseStock * (latestIndex/baseIndex + 2)
  // allowedMinStock = baseStock * (latestIndex/baseIndex - 2)
  const safeRanges: { date: string; baseStock: number; baseIndex: number; minSafe: number; maxSafe: number }[] = []
  for (let i = 0; i < 3; i++) {
    const baseS = stockData[i]?.close
    const baseI = indexData[i]?.close
    if (baseS == null || baseI == null) continue

    const ratio = latestIndexPrice / baseI
    const maxSafe = baseS * (ratio + 2)
    const minSafe = Math.max(0.01, baseS * (ratio - 2))

    safeRanges.push({ date: stockData[i].date, baseStock: baseS, baseIndex: baseI, minSafe: Math.round(minSafe * 100) / 100, maxSafe: Math.round(maxSafe * 100) / 100 })
  }
  
  // 日期区间信息
  const dateRange = {
    startDate: stockData[0]?.date,  // 30日窗口起始日（基准日）
    endDate: stockData[stockData.length - 1]?.date,  // 30日窗口结束日（计算日）
    tradingDays: stockData.length,  // 实际交易日数
    offsetDays  // 偏移天数
  }
  
  return NextResponse.json({
    stockCode: stockCode.replace(/^(sh|sz|SH|SZ)/, ''),
    stockName: stockInfo?.name || '未知',
    market: marketInfo.market.toUpperCase(),
    indexName: marketInfo.indexName,
    indexCode: marketInfo.indexCode,
    stockData,
    indexData,
    deviations: deviationsWithCumulative,
    totalDeviation,
    latestStockPrice,
    latestIndexPrice,
    stockInfo,
    dateRange,
    baseStockPrice,
    baseIndexPrice,
    safeRanges,
  })
}
