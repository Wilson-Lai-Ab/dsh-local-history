import { createElement, type ReactNode } from 'react'

/** Vitest stand-in for DSH MarkdownText (external at runtime). */
export function MarkdownText(props: {
  text: string
  codeLabels?: { copyLabel: string; copiedLabel: string }
  labels?: { code?: { copyLabel: string; copiedLabel: string } }
}): ReactNode {
  if (props.labels !== undefined && props.labels.code === undefined) {
    throw new Error("Cannot read properties of undefined (reading 'code')")
  }
  if (props.text.includes('THROW_PREVIEW')) {
    throw new Error("Cannot read properties of undefined (reading 'code')")
  }
  return createElement('div', { 'data-md': '' }, props.text)
}
