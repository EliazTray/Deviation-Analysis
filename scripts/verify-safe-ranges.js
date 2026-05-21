#!/usr/bin/env node
// 验证安全区间计算是否与工具结果吻合
const baseStock = [59.42, 64.00, 70.4]
const baseIndex = [3880.10, 3890.16, 3995.00]
const latestStock = 180
const latestIndex = 4077.28
const days = ['今天', '明天', '后天']

console.log('验证当前指数不变假设下的安全临界值：')
console.log('latestStock', latestStock, 'latestIndex', latestIndex)
console.log('----------------------------------------------------------')
for (let i = 0; i < 3; i++) {
  const bS = baseStock[i]
  const bI = baseIndex[i]
  const ratio = latestIndex / bI
  const maxSafe = Math.round(bS * (ratio + 2) * 100) / 100
  const minSafe = Math.round(Math.max(0.01, bS * (ratio - 2)) * 100) / 100
  const criticalCum = Math.round(((maxSafe / bS - 1) * 100) * 100) / 100
  const needChange = Math.round(((maxSafe / latestStock - 1) * 100) * 100) / 100

  console.log(`${days[i]} 基准日期: ${['4.3','4.7','4.8'][i]}`)
  console.log(`  baseStock=${bS} baseIndex=${bI}`)
  console.log(`  minSafe=${minSafe} maxSafe=${maxSafe}`)
  console.log(`  临界涨幅=${criticalCum}% 以今天收盘计需变动=${needChange}%`)
  console.log('')
}
