import { describe, expect, it } from 'vitest'
import { hunksFromTexts, paintFileDiff } from '../src/history/hunks.ts'

const before = [
  '        if (CollUtil.isEmpty(ids)) {',
  '            return true;',
  '        }',
  '        return mdLogisticsAddressMapper.physicalDeleteByIds(ids) > 0;',
  '    }',
  '',
  '    private LambdaQueryWrapper<MdLogisticsAddress> buildQueryWrapper(MdLogisticsAddressBo bo) {',
  '        MdLogisticsAddressBo query = bo != null ? bo : new MdLogisticsAddressBo();',
  '        LambdaQueryWrapper<MdLogisticsAddress> lqw = Wrappers.lambdaQuery();',
  '        if (StringUtils.isNotBlank(query.getAddressName())) {',
  '            lqw.apply("address_name ILIKE {0}", "%" + query.getAddressName().trim() + "%");',
  '        }',
  '        return lqw;',
  '    }',
].join('\n')

const inserted = [
  '    /**',
  '     * 未删除记录中是否已存在相同地址别称（精确匹配 trim 后的名称）。',
  '     * Mapper 带 {@code @TableLogic}，已软删除行不占名。',
  '     *',
  '     * @param addressName 地址别称',
  '     * @param excludeId 编辑时排除自身，新增传 null',
  '     * @return 存在则 true',
  '     */',
  '    public boolean existsByAddressName(String addressName, Long excludeId) {',
  '        if (StringUtils.isBlank(addressName)) {',
  '            return false;',
  '        }',
  '        LambdaQueryWrapper<MdLogisticsAddress> lqw = Wrappers.lambdaQuery();',
  '        lqw.eq(MdLogisticsAddress::getAddressName, addressName.trim());',
  '        lqw.ne(excludeId != null, MdLogisticsAddress::getId, excludeId);',
  '        return mdLogisticsAddressMapper.selectCount(lqw) > 0;',
  '    }',
  '',
].join('\n')

const after = [
  '        if (CollUtil.isEmpty(ids)) {',
  '            return true;',
  '        }',
  '        return mdLogisticsAddressMapper.physicalDeleteByIds(ids) > 0;',
  '    }',
  '',
  inserted,
  '    private LambdaQueryWrapper<MdLogisticsAddress> buildQueryWrapper(MdLogisticsAddressBo bo) {',
  '        MdLogisticsAddressBo query = bo != null ? bo : new MdLogisticsAddressBo();',
  '        LambdaQueryWrapper<MdLogisticsAddress> lqw = Wrappers.lambdaQuery();',
  '        if (StringUtils.isNotBlank(query.getAddressName())) {',
  '            lqw.apply("address_name ILIKE {0}", "%" + query.getAddressName().trim() + "%");',
  '        }',
  '        return lqw;',
  '    }',
].join('\n')

describe('Java method insert', () => {
  it('paints only the new method as add, not the surrounding methods', () => {
    const { rows, hunks } = paintFileDiff(before, after)
    expect(hunks).toHaveLength(1)
    expect(hunks[0]?.oldBlock).toBe('')
    const added = rows.filter((row) => row.kind === 'add').map((row) => row.text)
    expect(added.some((text) => text.includes('existsByAddressName'))).toBe(true)
    expect(rows.some((row) => row.kind === 'del')).toBe(false)
    expect(rows.some((row) => row.kind === 'ctx' && row.text.includes('physicalDeleteByIds'))).toBe(true)
    expect(rows.some((row) => row.kind === 'ctx' && row.text.includes('buildQueryWrapper'))).toBe(true)
    expect(rows.some((row) => row.kind === 'add' && row.text.includes('physicalDeleteByIds'))).toBe(false)
    expect(rows.some((row) => row.kind === 'add' && row.text.includes('buildQueryWrapper'))).toBe(false)
  })

  it('does not resync on a lone closing brace and swallow the next method', () => {
    const hunks = hunksFromTexts(before, after)
    expect(hunks.every((hunk) => !hunk.newBlock.includes('buildQueryWrapper'))).toBe(true)
    expect(hunks.every((hunk) => !hunk.oldBlock.includes('physicalDeleteByIds'))).toBe(true)
  })
})
