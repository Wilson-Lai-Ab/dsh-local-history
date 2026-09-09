import { describe, expect, it } from 'vitest'
import { collectTreeHits } from '../src/client/session-tree.ts'

describe('collectTreeHits', () => {
  it('reads DSH eventSource entries when session snapshot has no nodes', () => {
    const hits = collectTreeHits({
      list: {
        getSnapshot: () => ({ current: 'sess-1', byId: { 'sess-1': { id: 'sess-1', cwd: '/proj' } } }),
      },
      binding: () => ({
        session: {
          getSnapshot: () => ({}),
        },
        eventSource: {
          getSnapshot: () => ({
            entries: [
              {
                type: 'event',
                event: {
                  type: 'tool/call',
                  data: {
                    turn: 2,
                    callId: 'edit-1',
                    name: 'edit',
                    arguments: JSON.stringify({
                      file_path: '/proj/docs/README.md',
                      old_string: '# title',
                      new_string: '# title\n\nprobe',
                    }),
                  },
                },
              },
              {
                type: 'event',
                event: {
                  type: 'tool/result',
                  data: {
                    turn: 2,
                    message: {
                      source: { callId: 'edit-1' },
                      content: [{ type: 'tool-result', isError: false }],
                    },
                  },
                },
              },
            ],
          }),
        },
      }),
    }, 'sess-1', '/proj')
    expect(hits).toEqual([
      {
        path: '/proj/docs/README.md',
        kind: 'edit',
        oldText: '# title',
        turn: 2,
        diffs: [{ oldText: '# title', newText: '# title\n\nprobe' }],
      },
    ])
  })
})
