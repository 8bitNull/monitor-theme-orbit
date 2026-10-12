import { useEffect, useRef } from "react"
import { init, use } from "echarts/core"
import { LineChart, BarChart } from "echarts/charts"
import { GridComponent, TooltipComponent, LegendComponent } from "echarts/components"
import { CanvasRenderer } from "echarts/renderers"
import type { ECharts } from "echarts/core"

use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

/**
 * ECharts 薄封装：echarts 单独分包，随详情页一起懒加载；传入 option 即渲染。
 */
export function Echart({ option, className = "", label }: {
  option: Record<string, unknown>
  className?: string
  label?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ECharts | null>(null)

  useEffect(() => {
    let disposed = false
    Promise.resolve({ init }).then(({ init }) => {
      if (disposed || !ref.current) return
      chartRef.current = init(ref.current)
      chartRef.current.setOption(option)
    })
    return () => {
      disposed = true
      chartRef.current?.dispose()
      chartRef.current = null
    }
    // 只初始化一次；option 更新走下面的 effect。
  }, [])

  useEffect(() => {
    chartRef.current?.setOption(option, true)
  }, [option])

  useEffect(() => {
    const onResize = () => chartRef.current?.resize()
    window.addEventListener("resize", onResize)
    const ro = new ResizeObserver(onResize)
    if (ref.current) ro.observe(ref.current)
    return () => {
      window.removeEventListener("resize", onResize)
      ro.disconnect()
    }
  }, [])

  return <div ref={ref} role={label ? "img" : undefined} aria-label={label} className={className} />
}

/** 与页面配套的轴样式。 */
export function chartBase(dark: boolean) {
  return {
    axisLabel: { color: dark ? "#a0a0a0" : "#64748b", fontSize: 11 },
    axisLine: { lineStyle: { color: dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)" } },
    splitLine: { lineStyle: { color: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" } },
  }
}

export function tooltipBase() {
  return {
    trigger: "axis",
    confine: true,
    backgroundColor: "rgba(10,10,10,0.9)",
    borderColor: "rgba(255,255,255,0.1)",
    textStyle: { color: "#ededed", fontSize: 12 },
    extraCssText: "border-radius:8px;backdrop-filter:blur(8px);",
  }
}
