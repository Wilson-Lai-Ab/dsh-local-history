declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ReactNode } from 'react'
  export function MarkdownText(props: {
    text: string
    codeLabels?: { copyLabel: string; copiedLabel: string }
    labels?: { code?: { copyLabel: string; copiedLabel: string }; footnotes?: string }
  }): ReactNode
}
