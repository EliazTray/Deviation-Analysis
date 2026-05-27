import { NextRequest, NextResponse } from 'next/server'

// 判断股票市场及对应指数
function getMarketInfo(stockCode: string): { market: 'sh' | 'sz'; indexCode: string; indexName: string } | null {
  const code = stockCode.replace(/^(sh|sz|SH|SZ)/, '')
  
  // 科创板: 688开头 → 科创50指数
  if (code.startsWith('688')) {
    return { market: 'sh', indexCode: '000688', indexName: '科创50' }
  }
  // 沪市主板: 60开头 → 上证A股指数
  if (code.startsWith('60')) {
    return { market: 'sh', indexCode: '000001', indexName: '上证A股指数' }
  }
  // 创业板: 300/301开头 → 创业板综指
  if (code.startsWith('30')) {
    return { market: 'sz', indexCode: '399102', indexName: '创业板综指' }
  }
  // 深市主板: 000/001/002开头 → 深证A股指数
  if (code.startsWith('00')) {
    return { market: 'sz', indexCode: '399107', indexName: '深证A股指数' }
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
    
    const buffer = await response.arrayBuffer()
    const text = new TextDecoder('gbk').decode(buffer)
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
    
    const buffer = await response.arrayBuffer()
    const text = new TextDecoder('gbk').decode(buffer)
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
    
    const buffer = await response.arrayBuffer()
    const text = new TextDecoder('gbk').decode(buffer)
    const match = text.match(/"(.+)"/)
    if (!match) return null
    
    const parts = match[1].split(',')
    const current = parseFloat(parts[3])
    return {
      name: parts[0],
      open: parseFloat(parts[1]),
      lastClose: parseFloat(parts[2]),
      current: Number.isNaN(current) ? null : current,
      high: parseFloat(parts[4]),
      low: parseFloat(parts[5])
    }
  } catch (error) {
    console.error('Error fetching stock info:', error)
    return null
  }
}

// 获取指数实时信息
async function fetchIndexInfo(indexCode: string, market: 'sh' | 'sz') {
  const symbol = market === 'sh' ? `sh${indexCode}` : `sz${indexCode}`
  const url = `https://hq.sinajs.cn/list=${symbol}`

  try {
    const response = await fetch(url, {
      headers: {
        'Referer': 'https://finance.sina.com.cn',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })

    const buffer = await response.arrayBuffer()
    const text = new TextDecoder('gbk').decode(buffer)
    const match = text.match(/"(.+)"/)
    if (!match) return null

    const parts = match[1].split(',')
    const current = parseFloat(parts[3])
    return {
      name: parts[0],
      open: parseFloat(parts[1]),
      lastClose: parseFloat(parts[2]),
      current: Number.isNaN(current) ? null : current,
      high: parseFloat(parts[4]),
      low: parseFloat(parts[5])
    }
  } catch (error) {
    console.error('Error fetching index info:', error)
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
  
  // 拉取足够多的K线数据
  const datalen = 31 + 14 + offsetDays + 12
  
  const [allStockData, allIndexData, stockInfo, indexInfo] = await Promise.all([
    fetchStockData(stockCode, marketInfo.market, datalen),
    fetchIndexData(marketInfo.indexCode, marketInfo.market, datalen),
    fetchStockInfo(stockCode, marketInfo.market),
    fetchIndexInfo(marketInfo.indexCode, marketInfo.market)
  ])
  
  if (!allStockData || !allIndexData) {
    return NextResponse.json({ error: '获取数据失败，请稍后重试' }, { status: 500 })
  }

  // ===== 通过日期匹配构建窗口，确保股票和指数按日期对齐 =====

  const todayStr = (() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })()

  // 构建指数的日期索引 Map，用于按日期查找
  const indexByDate = new Map<string, { date: string; close: number; open: number; high: number; low: number }>()
  for (const item of allIndexData) {
    indexByDate.set(item.date, item)
  }

  // 以指数的交易日历为基准（指数不会停牌），确定交易日序列
  // 找到 <= 今天 的最新交易日
  let currentTradingDate = ''
  for (let i = allIndexData.length - 1; i >= 0; i--) {
    if (allIndexData[i].date <= todayStr) {
      currentTradingDate = allIndexData[i].date
      break
    }
  }
  if (!currentTradingDate) {
    return NextResponse.json({ error: '无法确定当前交易日' }, { status: 400 })
  }

  const stockByDate = new Map<string, { date: string; close: number; open: number; high: number; low: number }>()
  for (const item of allStockData) {
    stockByDate.set(item.date, item)
  }

  // 如果今天是交易日且K线数据中没有今天，用实时价格补一条
  // 这样今天就是期末日（第1天），窗口自然后移
  const todayDayOfWeek = new Date(todayStr + 'T00:00:00').getDay()
  const isTodayTradingDay = todayDayOfWeek >= 1 && todayDayOfWeek <= 5
  const isTodayInData = currentTradingDate === todayStr

  if (isTodayTradingDay && !isTodayInData && stockInfo?.current && indexInfo?.current) {
    const todayStock = {
      date: todayStr,
      close: stockInfo.current,
      open: stockInfo.open ?? stockInfo.current,
      high: stockInfo.high ?? stockInfo.current,
      low: stockInfo.low ?? stockInfo.current,
    }
    const todayIndex = {
      date: todayStr,
      close: indexInfo.current,
      open: indexInfo.open ?? indexInfo.current,
      high: indexInfo.high ?? indexInfo.current,
      low: indexInfo.low ?? indexInfo.current,
    }
    // 追加到原始数据中，让后续窗口计算自动包含今天
    allStockData.push(todayStock)
    allIndexData.push(todayIndex)
    stockByDate.set(todayStr, todayStock)
    indexByDate.set(todayStr, todayIndex)
    currentTradingDate = todayStr
  }

  // 从当前交易日往前偏移 offsetDays 个交易日（在指数日历上）
  const indexDates = allIndexData.map((d: { date: string }) => d.date)
  let currentDateIdx = indexDates.lastIndexOf(currentTradingDate)
  currentDateIdx -= offsetDays
  if (currentDateIdx < 0) {
    return NextResponse.json({ error: '偏移天数过大，数据中没有足够的交易日' }, { status: 400 })
  }
  currentTradingDate = indexDates[currentDateIdx]

  // 30天含当天：期末=第1天，期初=第30天，期初idx = 期末idx - 29
  // 基准=期初前一天收盘价，所以窗口从 baseDateIdx-1 开始（含期初前）
  const baseDateIdx = currentDateIdx - 29
  const preBaseDateIdx = baseDateIdx - 1
  if (preBaseDateIdx < 0) {
    return NextResponse.json({ error: `数据不足，当前交易日${currentTradingDate}往前不够30个交易日` }, { status: 400 })
  }

  // 构建主窗口：[期初前(基准), 期初(第30天), ..., 期末(第1天)]，共31条
  const windowDates = indexDates.slice(preBaseDateIdx, currentDateIdx + 1)
  const stockData: { date: string; close: number; open: number; high: number; low: number }[] = []
  const indexData: { date: string; close: number; open: number; high: number; low: number }[] = []

  for (const date of windowDates) {
    const stockItem = stockByDate.get(date)
    const indexItem = indexByDate.get(date)
    if (!indexItem) continue
    if (stockItem) {
      stockData.push(stockItem)
      indexData.push(indexItem)
    } else if (stockData.length > 0) {
      const lastStock = stockData[stockData.length - 1]
      stockData.push({ date, close: lastStock.close, open: lastStock.close, high: lastStock.close, low: lastStock.close })
      indexData.push(indexItem)
    }
  }

  // 扩展窗口：用于历史14天滑动计算（需要 14+30 = 44 条）
  const extBaseDateIdx = Math.max(0, currentDateIdx - 43)
  const extWindowDates = indexDates.slice(extBaseDateIdx, currentDateIdx + 1)
  const extStockData: { date: string; close: number; open: number; high: number; low: number }[] = []
  const extIndexData: { date: string; close: number; open: number; high: number; low: number }[] = []

  for (const date of extWindowDates) {
    const stockItem = stockByDate.get(date)
    const indexItem = indexByDate.get(date)
    if (!indexItem) continue
    if (stockItem) {
      extStockData.push(stockItem)
      extIndexData.push(indexItem)
    } else if (extStockData.length > 0) {
      const lastStock = extStockData[extStockData.length - 1]
      extStockData.push({ date, close: lastStock.close, open: lastStock.close, high: lastStock.close, low: lastStock.close })
      extIndexData.push(indexItem)
    }
  }

  if (stockData.length < 20) {
    return NextResponse.json({ error: `数据不足，只有${stockData.length}天交易数据` }, { status: 400 })
  }

  // 获取最新收盘价
  const latestStockPrice = stockData[stockData.length - 1]?.close || 0
  const latestIndexPrice = indexData[indexData.length - 1]?.close || 0

  // 实时价格（优先使用新浪实时行情）
  const realtimeStockPrice = stockInfo?.current ?? latestStockPrice
  const realtimeIndexPrice = indexInfo?.current ?? latestIndexPrice

  return NextResponse.json({
    stockCode: stockCode.replace(/^(sh|sz|SH|SZ)/, ''),
    stockName: stockInfo?.name || stockCode.replace(/^(sh|sz|SH|SZ)/, ''),
    market: marketInfo.market.toUpperCase(),
    indexName: marketInfo.indexName,
    indexCode: marketInfo.indexCode,
    // 按日期对齐的价格数据：[0]=期初前(基准日), [1]=期初(第30天), ..., [-1]=当前交易日
    stockData,
    indexData,
    // 扩展数据（用于历史14天滑动计算）
    extStockData,
    extIndexData,
    // 实时价格
    realtimeStockPrice,
    realtimeIndexPrice,
    latestStockPrice,
    latestIndexPrice,
    stockInfo,
    // 元信息
    currentTradingDate,
    offsetDays,
  })
}
