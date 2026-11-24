import type { ClientError } from '../api/client'

export function errorMessage(error: ClientError) {
  if (error.kind === 'network' || error.kind === 'timeout') return '网络不可用，请检查连接后重试'
  if (error.kind === 'configuration') return '测试 API 尚未配置'
  if (error.kind !== 'api') return '服务暂不可用，请稍后重试'
  if (error.status >= 500) return '服务暂不可用，请稍后重试'
  switch (error.code) {
    case 'NOT_FOUND': return '内容不存在或已下架'
    case 'RATE_LIMITED': return '操作太频繁，请稍后再试'
    case 'VALIDATION_FAILED': return '请检查填写内容后重试'
    case 'IDEMPOTENCY_CONFLICT': return '提交编号已占用，请重新提交'
    case 'FORBIDDEN': return '当前操作不可用'
    default: return '暂时无法完成操作，请稍后重试'
  }
}
