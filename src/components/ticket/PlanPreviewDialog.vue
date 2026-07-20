<script setup lang="ts">
import { computed } from 'vue'

import AppButton from '@/components/base/AppButton.vue'
import AppIcon from '@/components/base/AppIcon.vue'
import { groupSelections, type PrizeRange } from '@/features/betting/calculator'
import type { NormalizedMatch } from '@/features/matches/types'
import type { MarketCode, PlanSelection } from '@/types/domain'
import { centsToYuan } from '@/utils/money'

const props = defineProps<{
  show: boolean
  selections: PlanSelection[]
  matches: NormalizedMatch[]
  passCounts: number[]
  multiplier: number
  betCount: number
  stakeCents: number
  prizeRange: PrizeRange
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
  confirm: []
}>()

const resultLabels: Record<string, string> = { h: '胜', d: '平', a: '负' }
const scoreLabels: Record<string, string> = {
  home_other: '胜其它',
  draw_other: '平其它',
  away_other: '负其它',
}

const matchById = computed(() => new Map(props.matches.map((match) => [match.matchId, match])))

const rows = computed(() => [...groupSelections(props.selections)].map(([matchId, selections]) => {
  const match = matchById.value.get(matchId)
  const market = selections[0]?.market ?? 'had'
  return {
    matchId,
    matchNum: match?.matchNum || `场次${matchId}`,
    homeTeam: match?.homeTeam || '主队待同步',
    awayTeam: match?.awayTeam || '客队待同步',
    marketLabel: marketName(market, match),
    options: selections.map(optionLabel).join('、'),
  }
}))

const passLabel = computed(() => [...new Set(props.passCounts)]
  .sort((left, right) => left - right)
  .map((size) => `${size}关`)
  .join('、'))

function marketName(market: MarketCode, match?: NormalizedMatch): string {
  if (market === 'hhad') {
    const pool = match?.payload.odds.hhad
    const goalLine = String(pool?.goalLine || pool?.goalLineValue || '').trim()
    return goalLine ? `让球 ${goalLine}` : '让球胜平负'
  }
  return {
    had: '胜平负',
    crs: '比分',
    ttg: '总进球',
    hafu: '半全场',
  }[market]
}

function optionName(selection: PlanSelection): string {
  if (selection.market === 'had' || selection.market === 'hhad') {
    return resultLabels[selection.outcome] ?? selection.outcome
  }
  if (selection.market === 'ttg') {
    return selection.outcome === '7+' ? '7+球' : `${selection.outcome}球`
  }
  if (selection.market === 'hafu') {
    const [half, full] = selection.outcome.split('-')
    return `${resultLabels[half ?? ''] ?? half}${resultLabels[full ?? ''] ?? full}`
  }
  return scoreLabels[selection.outcome] ?? selection.outcome
}

function optionLabel(selection: PlanSelection): string {
  return `${optionName(selection)}(${selection.odds})`
}

function close(): void {
  emit('update:show', false)
}

function confirm(): void {
  emit('confirm')
}
</script>

<template>
  <van-popup
    :show="show"
    position="center"
    teleport="body"
    close-on-click-overlay
    class="plan-preview-popup"
    @update:show="emit('update:show', $event)"
  >
    <section class="plan-preview" role="dialog" aria-modal="true" aria-label="投注方案">
      <header class="plan-preview__header">
        <h2>投注方案</h2>
        <button type="button" data-overlay-close aria-label="关闭投注方案" @click="close">
          <AppIcon name="close" :size="18" />
        </button>
      </header>

      <div class="plan-preview__meta">
        <p>
          <strong>{{ rows.length }}场</strong><i>·</i>
          <strong>{{ selections.length }}个选项</strong><i>·</i>
          <strong>倍数{{ multiplier }}倍</strong>
        </p>
        <p>过关方式：{{ passLabel || '未选择' }}</p>
      </div>

      <div class="plan-preview__matches" :aria-label="`${rows.length}场比赛选择`">
        <article v-for="row in rows" :key="row.matchId" class="plan-preview__match">
          <div class="plan-preview__teams">
            <span>{{ row.matchNum }}</span>
            <strong>{{ row.homeTeam }}</strong>
            <i>VS</i>
            <strong>{{ row.awayTeam }}</strong>
          </div>
          <div class="plan-preview__options">
            <span>{{ row.marketLabel }}：</span>
            <strong>{{ row.options }}</strong>
          </div>
        </article>
      </div>

      <footer class="plan-preview__footer">
        <div class="plan-preview__finance">
          <p>共{{ betCount }}注<i>·</i>投注 <strong class="numeric">¥{{ centsToYuan(stakeCents) }}</strong></p>
          <p>理论奖金 <strong class="numeric">¥{{ centsToYuan(prizeRange.minCents) }}～{{ centsToYuan(prizeRange.maxCents) }}</strong></p>
        </div>
        <div class="plan-preview__actions">
          <AppButton block variant="secondary" @click="close">返回修改</AppButton>
          <AppButton block @click="confirm">确认方案</AppButton>
        </div>
      </footer>
    </section>
  </van-popup>
</template>

<style scoped>
.plan-preview-popup {
  width: min(calc(100vw - 56px), 324px);
  max-height: calc(100dvh - 72px);
  overflow: hidden;
  border-radius: 14px;
  background: var(--color-surface);
  box-shadow: var(--outline-strong), 0 20px 50px rgb(28 52 82 / 22%);
}

.plan-preview {
  display: grid;
  max-height: calc(100dvh - 72px);
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  color: var(--color-text);
  background: var(--color-surface);
}

.plan-preview__header {
  position: relative;
  display: grid;
  min-height: 44px;
  padding: 0 44px;
  border-bottom: 1px solid var(--color-divider);
  place-items: center;
}

.plan-preview__header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  line-height: 22px;
}

.plan-preview__header button {
  position: absolute;
  top: 0;
  right: 2px;
  display: grid;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  place-items: center;
  color: var(--color-text-secondary);
  background: transparent;
}

.plan-preview__meta {
  display: grid;
  gap: 4px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--color-divider);
}

.plan-preview__meta p,
.plan-preview__finance p {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  line-height: 18px;
}

.plan-preview__meta p:last-child {
  overflow: hidden;
  color: var(--color-text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-preview__meta strong {
  font-weight: 500;
}

.plan-preview__meta i,
.plan-preview__finance i {
  color: var(--color-text-secondary);
  font-style: normal;
}

.plan-preview__matches {
  display: grid;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.plan-preview__matches::-webkit-scrollbar {
  display: none;
}

.plan-preview__match {
  display: grid;
  min-height: 0;
  align-content: center;
  gap: 3px;
  padding: 7px 14px;
  border-bottom: 1px solid var(--color-divider);
}

.plan-preview__teams {
  display: grid;
  min-width: 0;
  grid-template-columns: auto minmax(0, 1fr) 20px minmax(0, 1fr);
  align-items: center;
  gap: 5px;
  font-size: 12px;
  line-height: 18px;
}

.plan-preview__teams > span {
  max-width: 64px;
  overflow: hidden;
  padding: 1px 6px;
  border-radius: 4px;
  color: var(--color-primary-strong);
  background: var(--color-primary-soft);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-preview__teams strong {
  overflow: hidden;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-preview__teams i {
  color: var(--color-text-secondary);
  font-style: normal;
  text-align: center;
}

.plan-preview__options {
  display: grid;
  min-width: 0;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 4px;
  font-size: 12px;
  line-height: 18px;
}

.plan-preview__options > span {
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.plan-preview__options strong {
  overflow: hidden;
  color: #ff5b67;
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-preview__footer {
  display: grid;
  gap: 7px;
  padding: 8px 14px 12px;
}

.plan-preview__finance {
  display: grid;
  gap: 2px;
}

.plan-preview__finance strong {
  color: #ff5b67;
  font-size: 14px;
  font-weight: 500;
}

.plan-preview__actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.plan-preview__actions :deep(.app-button) {
  height: 36px;
  padding-inline: 8px;
  font-size: 13px;
}

@media (max-height: 680px) {
  .plan-preview-popup,
  .plan-preview {
    max-height: calc(100dvh - 32px);
  }

  .plan-preview__match {
    gap: 1px;
    padding-block: 3px;
  }

  .plan-preview__meta,
  .plan-preview__footer {
    padding-block: 6px;
  }
}
</style>
