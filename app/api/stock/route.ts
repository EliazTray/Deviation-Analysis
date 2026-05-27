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
  const datalen = 31 + 14 + offsetDays + 10
  
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

  // 从当前交易日往前偏移 offsetDays 个交易日（在指数日历上）
  const indexDates = allIndexData.map((d: { date: string }) => d.date)
  let currentDateIdx = indexDates.lastIndexOf(currentTradingDate)
  currentDateIdx -= offsetDays
  if (currentDateIdx < 0) {
    return NextResponse.json({ error: '偏移天数过大，数据中没有足够的交易日' }, { status: 400 })
  }
  currentTradingDate = indexDates[currentDateIdx]

  // 从当前交易日往前数30个交易日（在指数日历上），得到基准日
  const baseDateIdx = currentDateIdx - 30
  if (baseDateIdx < 0) {
    return NextResponse.json({ error: `数据不足，当前交易日${currentTradingDate}往前不够30个交易日` }, { status: 400 })
  }
  const baseDate = indexDates[baseDateIdx]

  // 构建窗口：从基准日到当前交易日，按指数日历的日期序列
  // 对每个交易日，查找对应的股票数据（按日期匹配）
  const stockByDate = new Map<string, { date: string; close: number; open: number; high: number; low: number }>()
  for (const item of allStockData) {
    stockByDate.set(item.date, item)
  }

  const windowDates = indexDates.slice(baseDateIdx, currentDateIdx + 1)
  const stockData: { date: string; close: number; open: number; high: number; low: number }[] = []
  const indexData: { date: string; close: number; open: number; high: number; low: number }[] = []

  for (const date of windowDates) {
    const stockItem = stockByDate.get(date)
    const indexItem = indexByDate.get(date)
    if (!indexItem) continue
    // 如果股票当天没有数据（停牌），用前一天的收盘价填充
    if (stockItem) {
      stockData.push(stockItem)
      indexData.push(indexItem)
    } else if (stockData.length > 0) {
      const lastStock = stockData[stockData.length - 1]
      stockData.push({ date, close: lastStock.close, open: lastStock.close, high: lastStock.close, low: lastStock.close })
      indexData.push(indexItem)
    }
  }

  // 取更长窗口用于历史14天的滑动计算
  const extBaseDateIdx = Math.max(0, currentDateIdx - 13 - 30)
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

  // 基准价格（通过日期匹配确定的基准日收盘价）
  const baseStockPrice = stockData[0]?.close || 1
  const baseIndexPrice = indexData[0]?.close || 1

  console.info(`[窗口] 今天: ${todayStr}, 当前交易日: ${currentTradingDate}, 基准日: ${baseDate}`)
  console.info(`[匹配] 窗口: ${stockData.length}天, 基准股价: ${baseStockPrice}, 基准指数: ${baseIndexPrice}`)
  
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

  // 计算未来多天的安全价格区间
  // D+0 = 今天（如果今天还没收盘，数据最新日是昨天，今天是下一个交易日）
  // D+0 的30日基准 = 今天往前数第30个交易日
  // 在指数日历上：如果 currentTradingDate 是数据最新日(如5.26)，今天(5.27)是下一天
  //   今天(D+0)在日历上的虚拟位置 = currentDateIdx + 1
  //   D+0的30日基准索引 = (currentDateIdx + 1) - 30 = currentDateIdx - 29
  //   D+1的30日基准索引 = (currentDateIdx + 2) - 30 = currentDateIdx - 28
  // 如果 currentTradingDate 就是今天(数据包含今天)：
  //   今天(D+0)在日历上的位置 = currentDateIdx
  //   D+0的30日基准索引 = currentDateIdx - 30 = baseDateIdx（就是当前窗口的基准日）
  //   D+1的30日基准索引 = currentDateIdx - 29

  const isTodayInData = currentTradingDate === todayStr
  const d0Offset = isTodayInData ? 0 : 1  // D+0相对currentDateIdx的偏移

  const safeRanges: { date: string; baseStock: number; baseIndex: number; minSafe: number; maxSafe: number }[] = []

  for (let i = 0; i < 8; i++) {
    // D+i 的30日基准在指数日历中的索引
    const futureBaseDateIdx = (currentDateIdx + d0Offset + i) - 30

    if (futureBaseDateIdx < 0 || futureBaseDateIdx >= indexDates.length) continue

    const futureBaseDate = indexDates[futureBaseDateIdx]
    const baseI = indexByDate.get(futureBaseDate)?.close
    // 股票基准价：按日期查找，如果停牌则用之前最近的收盘价
    let baseS: number | undefined
    const stockOnBaseDate = stockByDate.get(futureBaseDate)
    if (stockOnBaseDate) {
      baseS = stockOnBaseDate.close
    } else {
      for (let j = futureBaseDateIdx - 1; j >= 0; j--) {
        const prevStock = stockByDate.get(indexDates[j])
        if (prevStock) { baseS = prevStock.close; break }
      }
    }

    if (baseS == null || baseI == null) continue

    const ratio = latestIndexPrice / baseI
    const maxSafe = baseS * (ratio + 2)
    const minSafe = Math.max(0.01, baseS * (ratio - 2))

    safeRanges.push({
      date: futureBaseDate,
      baseStock: baseS,
      baseIndex: baseI,
      minSafe: Math.round(minSafe * 100) / 100,
      maxSafe: Math.round(maxSafe * 100) / 100
    })
  }

  console.info(`[safeRanges] 当前交易日: ${currentTradingDate}, isTodayInData: ${isTodayInData}, D+0基准日: ${safeRanges[0]?.date}, 共${safeRanges.length}条`)
  
  // 计算过去14个交易日的每日累计偏离值（使用滑动的30日基准）
  // extStockData 中每条数据就是一个真实交易日，从某天往前数30条就是该天的30交易日基准
  // 最后一天 = 当前交易日，倒数第2天 = 前1个交易日...以此类推
  // 对于 extStockData[i]，其30个交易日前的基准就是 extStockData[i-30]
  const extLen = extStockData.length
  const historicalDeviations: {
    date: string; stockPrice: number; indexPrice: number;
    high: number; low: number;
    dailyChange: number; intradayHighChange: number;
    stockCumulativeChange: number; indexCumulativeChange: number;
    cumulativeDeviation: number; daysAgo: number;
    baseDate: string; baseStockPrice: number;
    safeMax: number; ma5: number; lowDeviationFromMa5: number;
    nearSafeMax: boolean; suspectControl: boolean; lostControl: boolean; outOfControl: boolean;
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
