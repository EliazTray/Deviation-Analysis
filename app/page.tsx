import { Suspense } from 'react'
import StockAnalyzer from '@/components/stock-analyzer'

export default function Home() {
  return (
    <Suspense>
      <StockAnalyzer />
    </Suspense>
  )
}
