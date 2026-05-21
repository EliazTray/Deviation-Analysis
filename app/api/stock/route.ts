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
  
  // 拉取更多数据以支持历史查询（30天 + 14天历史滑动 + offset + 缓冲）
  const datalen = 31 + 14 + offsetDays + 5
  
  const [allStockData, allIndexData, stockInfo, indexInfo] = await Promise.all([
    fetchStockData(stockCode, marketInfo.market, datalen),
    fetchIndexData(marketInfo.indexCode, marketInfo.market, datalen),
    fetchStockInfo(stockCode, marketInfo.market),
    fetchIndexInfo(marketInfo.indexCode, marketInfo.market)
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

  // 额外截取更长的数据用于历史14天滑动计算（需要 31+13=44 天数据）
  const extStartIndex = endIndex ? -(31 + 13 + offsetDays) : -(31 + 13)
  const extStockData = endIndex ? allStockData.slice(extStartIndex, endIndex) : allStockData.slice(extStartIndex)
  const extIndexData = endIndex ? allIndexData.slice(extStartIndex, endIndex) : allIndexData.slice(extStartIndex)
  
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
  
  // 获取最新收盘价
  const latestStockPrice = stockData[stockData.length - 1]?.close || 0
  const latestIndexPrice = indexData[indexData.length - 1]?.close || 0

  // 实时价格（优先使用新浪实时行情）
  const realtimeStockPrice = stockInfo?.current ?? latestStockPrice
  const realtimeIndexPrice = indexInfo?.current ?? latestIndexPrice

  // 实时偏离值：使用实时价格与30日前基准价计算
  const realtimeTotalDeviation = ((realtimeStockPrice - baseStockPrice) / baseStockPrice) * 100 - ((realtimeIndexPrice - baseIndexPrice) / baseIndexPrice) * 100

  console.info('stockInfo:', stockCode, stockInfo)
  console.info('indexInfo:', marketInfo.indexCode, indexInfo)
  console.info('resolvedStockName:', stockInfo?.name || stockCode.replace(/^(sh|sz|SH|SZ)/, ''))

  // 计算未来多天的安全价格区间，基于滑动的30日基准日
  // 今天/明天/后天以及后续5天的基准日依次使用 stockData 的前 8 个数据点
  const safeRanges: { date: string; baseStock: number; baseIndex: number; minSafe: number; maxSafe: number }[] = []
  for (let i = 0; i < 8; i++) {
    const baseS = stockData[i]?.close
    const baseI = indexData[i]?.close
    if (baseS == null || baseI == null) continue

    const ratio = latestIndexPrice / baseI
    const maxSafe = baseS * (ratio + 2)
    const minSafe = Math.max(0.01, baseS * (ratio - 2))

    safeRanges.push({
      date: stockData[i].date,
      baseStock: baseS,
      baseIndex: baseI,
      minSafe: Math.round(minSafe * 100) / 100,
      maxSafe: Math.round(maxSafe * 100) / 100
    })
  }
  
  // 计算过去14个交易日的每日累计偏离值（使用滑动的30日基准）
  // extStockData/extIndexData 包含 31+13=44 天数据，最后一天与 stockData 最后一天对齐
  // 对于 extStockData 中的第 i 天（i >= 30），其30日基准是 extStockData[i-30]
  const extLen = extStockData.length
  const historicalDeviations: {
    date: string; stockPrice: number; indexPrice: number;
    high: number; low: number;
    stockCumulativeChange: number; indexCumulativeChange: number;
    cumulativeDeviation: number; daysAgo: number;
    baseDate: string; baseStockPrice: number;
    safeMax: number; ma5: number;
    nearSafeMax: boolean; suspectControl: boolean; lostControl: boolean;
  }[] = []
  // 取 extStockData 的最后14天，每天独立计算30日偏离
  for (let dayIdx = 0; dayIdx < 14; dayIdx++) {
    const currentIdx = extLen - 14 + dayIdx
    if (currentIdx < 30 || currentIdx >= extLen) continue
    const baseIdx = currentIdx - 30
    const currentStock = extStockData[currentIdx]
    const currentIndex = extIndexData[currentIdx]
    const baseStock = extStockData[baseIdx]
    const baseIndexItem = extIndexData[baseIdx]
    if (!currentStock || !currentIndex || !baseStock || !baseIndexItem) continue

    const stockCumChange = ((currentStock.close - baseStock.close) / baseStock.close) * 100
    const indexCumChange = ((currentIndex.close - baseIndexItem.close) / baseIndexItem.close) * 100
    const cumDeviation = stockCumChange - indexCumChange

    // 安全上限：基准股票价 * (当日指数/基准指数 + 2)
    const indexRatio = currentIndex.close / baseIndexItem.close
    const safeMax = baseStock.close * (indexRatio + 2)

    // 5日均线（取当天及前4天的收盘价平均）
    let ma5Sum = 0
    let ma5Count = 0
    for (let k = 0; k < 5; k++) {
      const maIdx = currentIdx - k
      if (maIdx >= 0 && extStockData[maIdx]) {
        ma5Sum += extStockData[maIdx].close
        ma5Count++
      }
    }
    const ma5 = ma5Count > 0 ? ma5Sum / ma5Count : currentStock.close

    // 标记：接近安全上限（最高价达到安全上限的97%以上）
    const nearSafeMax = currentStock.high >= safeMax * 0.97

    // 标记：疑似控盘（前提是触及上限，且最高价比收盘价高出3%以上）
    const suspectControl = nearSafeMax && currentStock.close > 0 && ((currentStock.high - currentStock.close) / currentStock.close) >= 0.03

    // 最低价偏离5日线百分比（正值=最低价低于5日线，负值=最低价高于5日线）
    const lowDeviationFromMa5 = ma5 > 0 ? ((ma5 - currentStock.low) / ma5) * 100 : 0

    // 标记：不控盘信号（最低价低于5日线超过3%）
    const lostControl = lowDeviationFromMa5 >= 3

    // 标记：失控（最低价偏离5日线>=10%，已脱离趋势）
    const outOfControl = lowDeviationFromMa5 >= 10

    // 当日涨跌幅（相对前一交易日收盘价）
    const prevIdx = currentIdx - 1
    const prevClose = prevIdx >= 0 && extStockData[prevIdx] ? extStockData[prevIdx].close : currentStock.close
    const dailyChange = ((currentStock.close - prevClose) / prevClose) * 100
    // 盘中最高涨幅（最高价相对前一交易日收盘价）
    const intradayHighChange = ((currentStock.high - prevClose) / prevClose) * 100

    historicalDeviations.push({
      date: currentStock.date,
      stockPrice: currentStock.close,
      high: currentStock.high,
      low: currentStock.low,
      indexPrice: currentIndex.close,
      dailyChange,
      intradayHighChange,
      stockCumulativeChange: stockCumChange,
      indexCumulativeChange: indexCumChange,
      cumulativeDeviation: cumDeviation,
      daysAgo: 13 - dayIdx,
      baseDate: baseStock.date,
      baseStockPrice: baseStock.close,
      safeMax: Math.round(safeMax * 100) / 100,
      ma5: Math.round(ma5 * 100) / 100,
      lowDeviationFromMa5: Math.round(lowDeviationFromMa5 * 100) / 100,
      nearSafeMax,
      suspectControl,
      lostControl,
      outOfControl,
    })
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
    stockName: stockInfo?.name || stockCode.replace(/^(sh|sz|SH|SZ)/, ''),
    market: marketInfo.market.toUpperCase(),
    indexName: marketInfo.indexName,
    indexCode: marketInfo.indexCode,
    stockData,
    indexData,
    deviations: deviationsWithCumulative,
    totalDeviation,
    realtimeStockPrice,
    realtimeIndexPrice,
    realtimeTotalDeviation,
    latestStockPrice,
    latestIndexPrice,
    stockInfo,
    indexInfo,
    dateRange,
    baseStockPrice,
    baseIndexPrice,
    safeRanges,
    historicalDeviations,
  })
}
