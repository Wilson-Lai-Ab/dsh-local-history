import { describe, expect, it } from 'vitest'
import { applyHunkUndo, hunkMatches, hunksFromTexts, paintAfterOnly, paintFileDiff, paintSplitDiff, reconstructBefore } from '../src/history/hunks.ts'

describe('hunksFromTexts', () => {
  it('undoes one inserted island', () => {
    const oldT = 'a\nb\nc\n'
    const newT = 'a\nX\nb\nc\n'
    const hunks = hunksFromTexts(oldT, newT)
    expect(hunks.length).toBe(1)
    expect(applyHunkUndo(newT, hunks[0]!)).toBe(oldT)
  })

  it('reports mismatch when the file drifted', () => {
    const hunks = hunksFromTexts('a\n', 'a\nB\n')
    expect(hunkMatches('a\nC\n', hunks[0]!)).toBe(false)
  })
})

describe('paintFileDiff', () => {
  it('keeps unchanged lines and paints a mid-file replacement in place', () => {
    const before = [
      'export const third = \'child-write-3\'',
      '',
      'export function thirdPadTwo(): string {',
      '  return \'pad-2\'',
      '}',
      '',
      'export function thirdPadThree(): string {',
      '  return \'pad-3\'',
      '}',
    ].join('\n')
    const after = [
      'export const third = \'child-write-3\'',
      '',
      'export function thirdPadTwo(): string {',
      '  return \'pad-8\'',
      '}',
      '',
      'export function thirdPadThree(): string {',
      '  return \'pad-3\'',
      '}',
    ].join('\n')
    const { rows } = paintFileDiff(before, after)
    expect(rows.filter((row) => row.kind === 'ctx').map((row) => row.text)).toContain('export const third = \'child-write-3\'')
    expect(rows.filter((row) => row.kind === 'ctx').map((row) => row.text)).toContain('export function thirdPadThree(): string {')
    expect(rows.some((row) => row.kind === 'del' && row.text.includes('pad-2'))).toBe(true)
    expect(rows.some((row) => row.kind === 'add' && row.text.includes('pad-8'))).toBe(true)
    const add = rows.find((row) => row.kind === 'add' && row.text.includes('pad-8'))
    expect(add?.line).toBe(4)
  })
})

describe('paintAfterOnly', () => {
  it('keeps the after file and washes changed lines without deleted rows', () => {
    const { rows } = paintAfterOnly('keep\nold\nkeep2\n', 'keep\nnew\nkeep2\n')
    expect(rows.map((row) => `${row.kind}:${row.text}`)).toEqual(['ctx:keep', 'add:new', 'ctx:keep2'])
  })
})

describe('reconstructBefore', () => {
  it('rebuilds the full prior file from a 3-line-context hunk snippet', () => {
    const before = [
      'package com.hexin.masterdata.mapper;',
      '',
      'import java.util.List;',
      'import java.util.Set;',
      '',
      '/**',
      ' * 物流分组 Mapper 接口',
      ' *',
      ' * @author liyangang',
      ' * @date 2026-06-29',
      ' */',
      'public interface MdLogisticsGroupMapper extends BaseMapperPlus<MdLogisticsGroup, MdLogisticsGroupVo> {',
      '',
      '    /**',
      '     * 根据主键查询列表（含逻辑删除数据），用于同步比对',
      '     *',
      '     * @param ids 主键集合',
      '     * @return 实体列表',
      '     */',
      '    List<MdLogisticsGroup> selectListWithDeletedByIds(@Param("ids") List<Long> ids);',
      '',
      '    /**',
      '     * 物理删除',
      '     *',
      '     * @param ids 主键集合',
      '     * @return 影响行数',
      '     */',
      '    int physicalDeleteByIds(@Param("ids") Set<Long> ids);',
      '',
      '    /**',
      '     * 按物流方式 ID 反查所属物流分组 (type_id_str JSON 数组包含该 ID)',
      '     */',
      '    List<MdLogisticsTypeGroupMappingVo> selectGroupIdsByTypeIds(@Param("typeIds") List<Long> typeIds);',
      '',
      '    /**',
      '     * 查询启用中的 B2D 物流分组 type_id_str (JSON 数组文本，由 Service 层解析)',
      '     */',
      '    List<String> selectB2dGroupTypeIdStrList();',
      '}',
    ].join('\n')
    const after = [
      'package com.hexin.masterdata.mapper;',
      '',
      'import java.util.List;',
      'import java.util.Set;',
      '',
      '/**',
      ' * 物流分组 Mapper 接口',
      ' *',
      ' * @author liyangang',
      ' * @date 2026-06-29',
      ' */',
      'public interface MdLogisticsGroupMapper extends BaseMapperPlus<MdLogisticsGroup, MdLogisticsGroupVo> {',
      '',
      '    /**',
      '     * 根据主键查询列表（含逻辑删除数据），用于同步比对',
      '     *',
      '     * @param ids 主键集合',
      '     * @return 实体列表',
      '     */',
      '    List<MdLogisticsGroup> selectListWithDeletedByIds(@Param("ids") List<Long> ids);',
      '',
      '    /**',
      '     * 物理删除',
      '     *',
      '     * @param ids 主键集合',
      '     * @return 影响行数',
      '     */',
      '    int physicalDeleteByIds(@Param("ids") Set<Long> ids);',
      '',
      '    /**',
      '     * 按物流方式 ID 反查所属物流分组 (md_logistics_type_relation.relate_type=logistics_group)',
      '     */',
      '    List<MdLogisticsTypeGroupMappingVo> selectGroupIdsByTypeIds(@Param("typeIds") List<Long> typeIds);',
      '',
      '    /**',
      '     * 查询挂了启用且未删除、名称为 B2D 的物流分组的物流方式 ID (relation 表)',
      '     */',
      '    List<Long> selectB2dTypeIds();',
      '}',
    ].join('\n')
    const snippet = {
      oldText: [
        '    int physicalDeleteByIds(@Param("ids") Set<Long> ids);',
        '',
        '    /**',
        '     * 按物流方式 ID 反查所属物流分组 (type_id_str JSON 数组包含该 ID)',
        '     */',
        '    List<MdLogisticsTypeGroupMappingVo> selectGroupIdsByTypeIds(@Param("typeIds") List<Long> typeIds);',
        '',
        '    /**',
        '     * 查询启用中的 B2D 物流分组 type_id_str (JSON 数组文本，由 Service 层解析)',
        '     */',
        '    List<String> selectB2dGroupTypeIdStrList();',
        '}',
      ].join('\n'),
      newText: [
        '    int physicalDeleteByIds(@Param("ids") Set<Long> ids);',
        '',
        '    /**',
        '     * 按物流方式 ID 反查所属物流分组 (md_logistics_type_relation.relate_type=logistics_group)',
        '     */',
        '    List<MdLogisticsTypeGroupMappingVo> selectGroupIdsByTypeIds(@Param("typeIds") List<Long> typeIds);',
        '',
        '    /**',
        '     * 查询挂了启用且未删除、名称为 B2D 的物流分组的物流方式 ID (relation 表)',
        '     */',
        '    List<Long> selectB2dTypeIds();',
        '}',
      ].join('\n'),
    }
    expect(reconstructBefore(after, [snippet])).toBe(before)

    const paintedSnippet = paintFileDiff(snippet.oldText, after)
    expect(paintedSnippet.rows.some((row) => row.kind === 'add' && row.text.includes('物流分组 Mapper 接口'))).toBe(true)

    const painted = paintFileDiff(reconstructBefore(after, [snippet]) ?? '', after)
    expect(painted.rows.some((row) => row.kind === 'ctx' && row.text.includes('物流分组 Mapper 接口'))).toBe(true)
    expect(painted.rows.some((row) => row.kind === 'add' && row.text.includes('物流分组 Mapper 接口'))).toBe(false)
    expect(painted.rows.some((row) => row.kind === 'del' && row.text.includes('selectB2dGroupTypeIdStrList'))).toBe(true)
    expect(painted.rows.some((row) => row.kind === 'add' && row.text.includes('selectB2dTypeIds'))).toBe(true)
  })

  it('returns null when the new-side snippet is not unique', () => {
    expect(reconstructBefore('a\na\n', [{ oldText: 'b', newText: 'a' }])).toBeNull()
  })
})

describe('paintSplitDiff', () => {
  it('puts deletions on the left and additions on the right with line numbers', () => {
    const { rows } = paintSplitDiff('a\nb\nc\n', 'a\nX\nc\n')
    expect(rows).toEqual([
      {
        left: { line: 1, text: 'a', kind: 'ctx' },
        right: { line: 1, text: 'a', kind: 'ctx' },
      },
      {
        left: { line: 2, text: 'b', kind: 'del' },
        right: { line: 2, text: 'X', kind: 'add' },
      },
      {
        left: { line: 3, text: 'c', kind: 'ctx' },
        right: { line: 3, text: 'c', kind: 'ctx' },
      },
    ])
  })
})
