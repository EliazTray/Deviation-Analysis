import { NextRequest, NextResponse } from 'next/server'

// 判断股票市场及对应指数
function getMarketInfo(stockCode: string): { market: 'sh' | 'sz'; indexCode: string; indexName: string } | null {
  const code = stockCode.replace(/^(sh|sz|SH|SZ)/, '')
  if (code.startsWith('688')) {
    return { market: 'sh', indexCode: '000688', indexName: '科创50' }
  }
  if (code.startsWith('60')) {
    return { market: 'sh', indexCode: '000001', indexName: '上证指数' }
  }
  if (code.startsWith('30')) {
    return { market: 'sz', indexCode: '399006', indexName: '创业板指' }
  }
  if (code.startsWith('00')) {
    return { market: 'sz', indexCode: '399001', indexName: '深证成指' }
  }
  return null
}

async function fetchRealtimeQuote(symbol: string) {
  const url = `https://hq.sinajs.cn/list=${symbol}`
  try {
    const response = await fetch(url, {
      headers: {
        'Referer': 'https://finance.sina.com.cn',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      cache: 'no-store',
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
      low: parseFloat(parts[5]),
    }
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const stockCode = searchParams.get('code')

  if (!stockCode) {
    return NextResponse.json({ error: '请输入股票代码' }, { status: 400 })
  }

  const marketInfo = getMarketInfo(stockCode)
  if (!marketInfo) {
    return NextResponse.json({ error: '无效的股票代码' }, { status: 400 })
  }

  const stockSymbol = `${marketInfo.market}${stockCode.replace(/^(sh|sz|SH|SZ)/, '')}`
  const indexSymbol = marketInfo.market === 'sh' ? `sh${marketInfo.indexCode}` : `sz${marketInfo.indexCode}`

  const [stockQuote, indexQuote] = await Promise.all([
    fetchRealtimeQuote(stockSymbol),
    fetchRealtimeQuote(indexSymbol),
  ])

  return NextResponse.json({
    stockPrice: stockQuote?.current ?? null,
    stockName: stockQuote?.name ?? null,
    stockHigh: stockQuote?.high ?? null,
    stockLow: stockQuote?.low ?? null,
    stockOpen: stockQuote?.open ?? null,
    stockLastClose: stockQuote?.lastClose ?? null,
    indexPrice: indexQuote?.current ?? null,
    indexName: indexQuote?.name ?? marketInfo.indexName,
    indexLastClose: indexQuote?.lastClose ?? null,
    timestamp: Date.now(),
  })
}
