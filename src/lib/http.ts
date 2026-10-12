export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** hub 的一切错误都是写给读者看的一行字；其余来自前置代理，用状态码描述。 */
async function failure(res: Response): Promise<ApiError> {
  const text = res.headers.get("content-type")?.startsWith("text/plain") ? (await res.text()).trim() : ""
  return new ApiError(
    res.status,
    text || (res.status >= 500 ? `服务暂时无法访问（HTTP ${res.status}），稍后再试` : `请求被拦截（HTTP ${res.status}），稍后再试`),
  )
}

export async function api<T>(path: string, init?: RequestInit, initialResponse?: Promise<Response>): Promise<T> {
  let res: Response
  try {
    res = await (initialResponse ?? fetch(`/api${path}`, {
      ...init,
      headers: init?.body ? { "content-type": "application/json", ...init?.headers } : init?.headers,
    }))
    if (init?.signal?.aborted) throw init.signal.reason ?? new DOMException("Aborted", "AbortError")
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error
    throw new ApiError(0, "网络连接失败，稍后再试")
  }
  if (!res.ok) {
    if (res.status === 401 && path !== "/me" && typeof window !== "undefined") window.dispatchEvent(new Event("dstatus-auth-invalidated"))
    throw await failure(res)
  }
  if (res.status === 204) return undefined as T
  return res.json().catch((error: unknown) => {
    if (error instanceof Error && error.name === "AbortError") throw error
    throw new ApiError(res.status, "收到的不是状态数据，稍后再试")
  })
}
