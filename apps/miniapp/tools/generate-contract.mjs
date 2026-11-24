import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import openapiTS, { astToString } from 'openapi-typescript'
import { parse } from 'yaml'

const source = process.argv[2] ?? fileURLToPath(new URL('../../../packages/contracts/openapi.yaml', import.meta.url))
const output = new URL('../src/api/generated.ts', import.meta.url)
const spec = parse(await readFile(source, 'utf8'))
const isPublicOperation = (value) => value?.tags?.includes('Public')
const paths = Object.fromEntries(Object.entries(spec.paths)
  .filter(([, item]) => Object.values(item).some(isPublicOperation)))

const components = {}
function includeReferences(value) {
  if (!value || typeof value !== 'object') return
  if (value.$ref) {
    const match = /^#\/components\/([^/]+)\/([^/]+)$/.exec(value.$ref)
    if (!match) throw new Error(`Unsupported OpenAPI reference: ${value.$ref}`)
    const [, kind, name] = match
    const group = components[kind] ??= {}
    if (Object.hasOwn(group, name)) return
    const target = spec.components[kind]?.[name]
    if (!target) throw new Error(`Missing OpenAPI reference: ${value.$ref}`)
    group[name] = target
    includeReferences(target)
  }
  for (const item of Object.values(value)) includeReferences(item)
}
includeReferences(paths)

const operations = Object.entries(paths).flatMap(([path, item]) =>
  Object.values(item).filter(isPublicOperation).map((operation) => [operation.operationId, { path, operation }]))
const apiPaths = Object.fromEntries(operations.map(([id, { path }]) => [id, path]))
const inquiry = Object.fromEntries(operations).createTestInquiry.operation
const apiHeaders = {
  idempotencyKey: inquiry.parameters.find((parameter) => parameter.in === 'header').name,
  idempotentReplay: Object.keys(inquiry.responses['200'].headers)[0],
}
const inquirySchema = components.schemas.TestInquiryCreate.properties
const constants = {
  apiPaths,
  apiHeaders,
  contentTypes: components.schemas.ContentType.enum,
  errorCodes: components.schemas.ErrorResponse.properties.error.properties.code.enum,
  inquiryKinds: inquirySchema.kind.enum,
  inquiryLimits: Object.fromEntries(Object.entries(inquirySchema)
    .filter(([, value]) => value.maxLength)
    .map(([key, value]) => [key, value.maxLength])),
}
const declarations = Object.entries(constants)
  .map(([key, value]) => `export const ${key} = ${JSON.stringify(value, null, 2)} as const`)
const api = { openapi: spec.openapi, info: spec.info, paths, components }
const types = astToString(await openapiTS(api, { alphabetize: true }))
await writeFile(output, [
  '// Generated from packages/contracts/openapi.yaml by tools/generate-contract.mjs.',
  '// Edit the upstream contract and regenerate this public API projection.',
  types.trimEnd(),
  ...declarations,
].join('\n\n') + '\n')
console.log('Generated src/api/generated.ts from the public OpenAPI operations.')
