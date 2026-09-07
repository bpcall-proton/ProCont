import { recognize } from 'tesseract.js'
import { markupPercentage, productSalePrice, roundMoney } from './accounting'
import { createId } from './defaults'
import type { AccountingProduct, InvoiceLine } from './types'

function normalized(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, '')
}

function numberValue(value: string) {
  const parsed = Number(value.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function lineQuantity(line: string, productCode: string) {
  const normalizedCode = normalized(productCode)
  const values = line.match(/\d+(?:[.,]\d+)?/g) ?? []
  return (
    values
      .map((value) => ({
        value: numberValue(value),
        normalized: normalized(value),
      }))
      .find(
        (candidate) =>
          candidate.value > 0 && candidate.normalized !== normalizedCode,
      )?.value ?? 1
  )
}

function extractedDate(text: string) {
  const match = text.match(
    /\b(0?[1-9]|[12]\d|3[01])[./-](0?[1-9]|1[0-2])[./-](20\d{2})\b/,
  )
  if (!match) return null
  const [, day, month, year] = match
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

function extractedInvoiceNumber(text: string) {
  const match = text.match(
    /(?:factura|fattura|invoice)\s*(?:nr|no|numar|numero)?[.:#\s-]*([a-z0-9/-]{2,})/i,
  )
  return match?.[1]?.trim() ?? ''
}

export async function analyzeInvoiceImages(
  images: string[],
  products: AccountingProduct[],
) {
  const results = await Promise.all(
    images.map((image) => recognize(image, 'eng')),
  )
  const text = results.map((result) => result.data.text).join('\n')
  const confidence =
    results.length > 0
      ? roundMoney(
          results.reduce((sum, result) => sum + result.data.confidence, 0) /
            results.length,
        )
      : null
  const textLines = text.split(/\r?\n/).filter((line) => line.trim())
  const lines: InvoiceLine[] = []

  for (const product of products) {
    const code = normalized(product.code)
    if (!code) continue
    const matchedLines = textLines.filter((line) =>
      normalized(line).includes(code),
    )
    if (matchedLines.length === 0) continue
    const quantity = matchedLines.reduce(
      (sum, line) => sum + lineQuantity(line, product.code),
      0,
    )
    const unitPurchaseCostInclVat = product.purchaseCostInclVat
    const unitSalePriceInclVat = productSalePrice(product)
    const purchaseTotalInclVat = roundMoney(
      quantity * unitPurchaseCostInclVat,
    )
    const saleTotalInclVat = roundMoney(quantity * unitSalePriceInclVat)
    lines.push({
      id: createId('invoice-line'),
      productId: product.id,
      productCode: product.code,
      description: product.name,
      quantity,
      unit: product.unit,
      unitPurchaseCostInclVat,
      unitSalePriceInclVat,
      purchaseTotalInclVat,
      saleTotalInclVat,
      markupPercent: markupPercentage(
        purchaseTotalInclVat,
        saleTotalInclVat,
      ),
    })
  }

  return {
    text,
    confidence,
    date: extractedDate(text),
    invoiceNumber: extractedInvoiceNumber(text),
    lines,
  }
}
