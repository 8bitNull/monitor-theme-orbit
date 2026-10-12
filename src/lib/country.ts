/** ISO 3166-1 alpha-2 → 中文名。缺失的代码原样展示。 */
const NAMES: Record<string, string> = {
  CN: "中国", US: "美国", HK: "香港", TW: "台湾", MO: "澳门", JP: "日本", SG: "新加坡", KR: "韩国",
  KP: "朝鲜", MN: "蒙古", MY: "马来西亚", TH: "泰国", VN: "越南", PH: "菲律宾", ID: "印度尼西亚",
  IN: "印度", PK: "巴基斯坦", BD: "孟加拉国", LK: "斯里兰卡", NP: "尼泊尔", KZ: "哈萨克斯坦",
  UZ: "乌兹别克斯坦", GE: "格鲁吉亚", AM: "亚美尼亚", AZ: "阿塞拜疆",
  AE: "阿联酋", SA: "沙特阿拉伯", QA: "卡塔尔", KW: "科威特", BH: "巴林", OM: "阿曼",
  IL: "以色列", TR: "土耳其", CY: "塞浦路斯", IQ: "伊拉克", IR: "伊朗",
  DE: "德国", FR: "法国", GB: "英国", NL: "荷兰", BE: "比利时", LU: "卢森堡", IE: "爱尔兰",
  ES: "西班牙", PT: "葡萄牙", IT: "意大利", CH: "瑞士", AT: "奥地利", MT: "马耳他",
  PL: "波兰", CZ: "捷克", SK: "斯洛伐克", HU: "匈牙利", RO: "罗马尼亚", BG: "保加利亚",
  GR: "希腊", HR: "克罗地亚", RS: "塞尔维亚", SI: "斯洛文尼亚", UA: "乌克兰", BY: "白俄罗斯",
  SE: "瑞典", NO: "挪威", DK: "丹麦", FI: "芬兰", IS: "冰岛", EE: "爱沙尼亚", LV: "拉脱维亚",
  LT: "立陶宛",
  CA: "加拿大", MX: "墨西哥", BR: "巴西", AR: "阿根廷", CL: "智利", CO: "哥伦比亚",
  PE: "秘鲁",
  AU: "澳大利亚", NZ: "新西兰", FJ: "斐济",
  ZA: "南非", EG: "埃及", NG: "尼日利亚", KE: "肯尼亚", MA: "摩洛哥", DZ: "阿尔及利亚",
  TN: "突尼斯", GH: "加纳", TZ: "坦桑尼亚", ET: "埃塞俄比亚",
}

export function countryName(code: string | undefined): string {
  if (!code) return ""
  return NAMES[code.toUpperCase()] ?? code.toUpperCase()
}
