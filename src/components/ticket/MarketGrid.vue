<script setup lang="ts">
import { computed } from 'vue'

import type { OddsPool } from '@/features/matches/types'
import type { MarketCode } from '@/types/domain'

interface Option {
  outcome: string
  label: string
  odds: string
  group?: 'home' | 'draw' | 'away'
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
  const exact = Object.keys(props.pool).flatMap((key) => {
    const match = /^s(\d{2})s(\d{2})$/.exec(key)
    if (!match) return []
    const home = Number(match[1])
    const away = Number(match[2])
    const odds = odd(key)
    if (!odds) return []
    return [{
      outcome: `${home}:${away}`,
      label: `${home}:${away}`,
      odds,
      group: home > away ? 'home' : home < away ? 'away' : 'draw',
    } satisfies Option]
  })
  const others: Option[] = [
    { outcome: 'home_other', label: '胜其他', odds: odd('s1sh'), group: 'home' },
    { outcome: 'draw_other', label: '平其他', odds: odd('s1sd'), group: 'draw' },
    { outcome: 'away_other', label: '负其他', odds: odd('s1sa'), group: 'away' },
  ].filter((item) => item.odds)
  return [...exact, ...others]
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
    }))
  }
  return scoreOptions()
})

const scoreGroups = computed(() => [
  { key: 'home', label: '主胜比分', options: options.value.filter((item) => item.group === 'home') },
  { key: 'draw', label: '平局比分', options: options.value.filter((item) => item.group === 'draw') },
  { key: 'away', label: '客胜比分', options: options.value.filter((item) => item.group === 'away') },
])

function selected(option: Option): boolean {
  return props.selectedKeys.includes(`${props.matchId}|${props.market}|${option.outcome}`)
}
</script>

<template>
  <div v-if="market === 'crs'" class="score-markets">
    <section v-for="group in scoreGroups" :key="group.key" class="score-market">
      <h4>{{ group.label }}</h4>
      <div class="odds-grid odds-grid--six">
        <button
          v-for="option in group.options"
          :key="option.outcome"
          type="button"
          :class="['odds-cell', { 'odds-cell--selected': selected(option) }]"
          :disabled="!option.odds"
          :aria-pressed="selected(option)"
          @click="emit('select', { market, outcome: option.outcome, odds: option.odds })"
        >
          <span>{{ option.label }}</span>
          <strong class="numeric">{{ option.odds || '-' }}</strong>
        </button>
      </div>
    </section>
  </div>

  <div v-else :class="['odds-grid', market === 'had' || market === 'hhad' ? 'odds-grid--three' : 'odds-grid--six']">
    <button
      v-for="option in options"
      :key="option.outcome"
      type="button"
      :class="['odds-cell', { 'odds-cell--selected': selected(option) }]"
      :disabled="!option.odds"
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

.odds-grid--three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.odds-grid--six {
  grid-template-columns: repeat(6, minmax(0, 1fr));
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
  font-size: 11px;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.odds-cell strong {
  font-size: 12px;
  line-height: 1.15;
}

.odds-cell--selected {
  color: #fff;
  background: var(--color-accent);
  box-shadow: var(--outline-accent);
}

.odds-cell--selected span {
  color: #fff;
}

.odds-cell:disabled {
  color: var(--color-text-tertiary);
  background: #f0f3f7;
  box-shadow: var(--outline-default);
}

.odds-cell:disabled span {
  color: var(--color-text-tertiary);
}

.score-markets,
.score-market {
  display: grid;
  gap: var(--space-2);
}

.score-markets {
  gap: var(--space-3);
}

.score-market h4 {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  font-weight: 650;
  line-height: 1.3;
}

</style>
