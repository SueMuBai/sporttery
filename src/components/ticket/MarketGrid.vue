<script setup lang="ts">
import { computed } from 'vue'

import type { OddsPool } from '@/features/matches/types'
import type { MarketCode } from '@/types/domain'

interface Option {
  outcome: string
  label: string
  odds: string
  group?: 'home' | 'draw' | 'away'
  ariaLabel?: string
}

interface ScoreGridItem {
  key: string
  option?: Option
}

const props = defineProps<{
  matchId: number
  market: MarketCode
  pool: OddsPool
  selectedKeys: string[]
}>()

const emit = defineEmits<{
  select: [value: { market: MarketCode; outcome: string; odds: string }]
}>()

const resultLabels = { h: '胜', d: '平', a: '负' } as const
const halfLabels = { h: '胜', d: '平', a: '负' } as const

function odd(key: string): string {
  const value = String(props.pool[key] ?? '')
  return /^\d+(?:\.\d+)?$/.test(value) ? value : ''
}

function scoreOptions(): Option[] {
  const groups: Array<{
    group: NonNullable<Option['group']>
    entries: Array<[key: string, outcome: string, label: string]>
  }> = [
    {
      group: 'home',
      entries: [
        ['s01s00', '1:0', '1:0'], ['s02s00', '2:0', '2:0'], ['s02s01', '2:1', '2:1'],
        ['s03s00', '3:0', '3:0'], ['s03s01', '3:1', '3:1'], ['s03s02', '3:2', '3:2'],
        ['s04s00', '4:0', '4:0'], ['s04s01', '4:1', '4:1'], ['s04s02', '4:2', '4:2'],
        ['s05s00', '5:0', '5:0'], ['s05s01', '5:1', '5:1'], ['s05s02', '5:2', '5:2'],
        ['s1sh', 'home_other', '胜其它'],
      ],
    },
    {
      group: 'draw',
      entries: [
        ['s00s00', '0:0', '0:0'], ['s01s01', '1:1', '1:1'], ['s02s02', '2:2', '2:2'],
        ['s03s03', '3:3', '3:3'], ['s1sd', 'draw_other', '平其它'],
      ],
    },
    {
      group: 'away',
      entries: [
        ['s00s01', '0:1', '0:1'], ['s00s02', '0:2', '0:2'], ['s01s02', '1:2', '1:2'],
        ['s00s03', '0:3', '0:3'], ['s01s03', '1:3', '1:3'], ['s02s03', '2:3', '2:3'],
        ['s00s04', '0:4', '0:4'], ['s01s04', '1:4', '1:4'], ['s02s04', '2:4', '2:4'],
        ['s00s05', '0:5', '0:5'], ['s01s05', '1:5', '1:5'], ['s02s05', '2:5', '2:5'],
        ['s1sa', 'away_other', '负其它'],
      ],
    },
  ]

  return groups.flatMap(({ group, entries }) =>
    entries.map(([key, outcome, label]) => ({ outcome, label, odds: odd(key), group })),
  )
}

const options = computed<Option[]>(() => {
  if (props.market === 'had' || props.market === 'hhad') {
    return (['h', 'd', 'a'] as const).map((outcome) => ({
      outcome,
      label: resultLabels[outcome],
      odds: odd(outcome),
    }))
  }
  if (props.market === 'ttg') {
    return Array.from({ length: 8 }, (_, index) => ({
      outcome: index === 7 ? '7+' : String(index),
      label: index === 7 ? '7+' : `${index}球`,
      odds: odd(`s${index}`),
    }))
  }
  if (props.market === 'hafu') {
    return (['hh', 'hd', 'ha', 'dh', 'dd', 'da', 'ah', 'ad', 'aa'] as const).map((key) => ({
      outcome: `${key[0]}-${key[1]}`,
      label: `${halfLabels[key[0] as keyof typeof halfLabels]}${halfLabels[key[1] as keyof typeof halfLabels]}`,
      odds: odd(key),
      ariaLabel: `半场${halfLabels[key[0] as keyof typeof halfLabels]}、全场${halfLabels[key[1] as keyof typeof halfLabels]}`,
    }))
  }
  return scoreOptions()
})

const scoreGridItems = computed<ScoreGridItem[]>(() => {
  const groups = (['home', 'draw', 'away'] as const).map((group) =>
    options.value.filter((item) => item.group === group),
  )

  return groups.flatMap((group, groupIndex) => {
    const groupItems = group.map((option) => ({ key: option.outcome, option }))
    if (groupIndex === groups.length - 1) return groupItems

    const spacerCount = (5 - (group.length % 5)) % 5
    return [
      ...groupItems,
      ...Array.from({ length: spacerCount }, (_, index) => ({
        key: `spacer-${groupIndex}-${index}`,
      })),
    ]
  })
})

function selected(option: Option): boolean {
  return props.selectedKeys.includes(`${props.matchId}|${props.market}|${option.outcome}`)
}
</script>

<template>
  <div v-if="market === 'crs'" class="odds-grid odds-grid--score">
    <template v-for="item in scoreGridItems" :key="item.key">
      <span v-if="!item.option" class="score-grid__spacer" aria-hidden="true" />
      <button
        v-else
        type="button"
        :class="['odds-cell', { 'odds-cell--selected': selected(item.option) }]"
        :disabled="!item.option.odds"
        :aria-pressed="selected(item.option)"
        @click="emit('select', { market, outcome: item.option.outcome, odds: item.option.odds })"
      >
        <span>{{ item.option.label }}</span>
        <strong class="numeric">{{ item.option.odds || '-' }}</strong>
      </button>
    </template>
  </div>

  <div
    v-else
    :class="[
      'odds-grid',
      market === 'had' || market === 'hhad'
        ? 'odds-grid--result'
        : market === 'ttg'
          ? 'odds-grid--goals'
          : 'odds-grid--half-full',
    ]"
  >
    <button
      v-for="option in options"
      :key="option.outcome"
      type="button"
      :class="['odds-cell', { 'odds-cell--selected': selected(option) }]"
      :disabled="!option.odds"
      :aria-label="option.ariaLabel ? `${option.ariaLabel}，赔率${option.odds || '暂无'}` : undefined"
      :aria-pressed="selected(option)"
      @click="emit('select', { market, outcome: option.outcome, odds: option.odds })"
    >
      <span>{{ option.label }}</span>
      <strong class="numeric">{{ option.odds || '-' }}</strong>
    </button>
  </div>
</template>

<style scoped>
.odds-grid {
  display: grid;
  gap: 6px;
}

.odds-grid--result {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.odds-grid--half-full {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.odds-grid--goals {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.odds-grid--score {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.score-grid__spacer {
  min-height: 48px;
  visibility: hidden;
}

.odds-cell {
  display: grid;
  min-width: 0;
  min-height: 48px;
  padding: 5px 2px;
  border: 0;
  border-radius: var(--radius-xs);
  place-items: center;
  align-content: center;
  gap: 2px;
  color: var(--color-text);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
  line-height: 1;
}

.odds-cell span {
  overflow: hidden;
  max-width: 100%;
  color: var(--color-accent-strong);
  font-size: 12px;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.odds-cell strong {
  font-size: 13px;
  line-height: 1.15;
}

.odds-grid--result .odds-cell {
  min-height: 48px;
}

.odds-grid--score .odds-cell span {
  font-size: 12px;
}

.odds-grid--score .odds-cell strong {
  color: var(--color-text-tertiary);
  font-size: 11px;
}

.odds-cell--selected {
  color: var(--color-text);
  background: #fff0f3;
  box-shadow: inset 0 0 0 1px #ff6475;
}

.odds-cell--selected span {
  color: #ff5b67;
}

.odds-grid--goals .odds-cell:not(.odds-cell--selected) span {
  color: var(--color-text-secondary);
}

.odds-grid--half-full .odds-cell:not(.odds-cell--selected) span {
  color: var(--color-text);
}

.odds-cell:disabled {
  color: var(--color-text-tertiary);
  background: #f0f3f7;
  box-shadow: var(--outline-default);
}

.odds-cell:disabled span {
  color: var(--color-text-tertiary);
}

</style>
