<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import AppCard from '@/components/base/AppCard.vue'
import AppIcon from '@/components/base/AppIcon.vue'
import MarketGrid from '@/components/ticket/MarketGrid.vue'
import type { NormalizedMatch } from '@/features/matches/types'
import type { TicketMarket } from '@/stores/ticket'
import type { MarketCode } from '@/types/domain'

const props = defineProps<{
  match: NormalizedMatch
  activeMarket: TicketMarket
  selectedKeys: string[]
  expanded: boolean
  mixedMarket: MarketCode
}>()

const emit = defineEmits<{
  select: [value: { market: MarketCode; outcome: string; odds: string }]
  toggleHistory: []
  changeMixedMarket: [market: MarketCode]
}>()

const summary = computed(() => props.match.payload.historySummary)
const mixedSections: Array<{
  key: string
  label: string
  openMarket: MarketCode
}> = [
  { key: 'score', label: '比分', openMarket: 'crs' },
  { key: 'goals', label: '总进球', openMarket: 'ttg' },
  { key: 'half-full', label: '半全场', openMarket: 'hafu' },
]

function sectionKeyForMarket(market: MarketCode): string | undefined {
  return mixedSections.find((section) => section.openMarket === market)?.key
}

const expandedMixedSection = ref(sectionKeyForMarket(props.mixedMarket) ?? 'score')

watch(
  () => props.mixedMarket,
  (market) => {
    const key = sectionKeyForMarket(market)
    if (key) expandedMixedSection.value = key
  },
)

function toggleMixedSection(section: (typeof mixedSections)[number]): void {
  expandedMixedSection.value = expandedMixedSection.value === section.key ? '' : section.key
  emit('changeMixedMarket', section.openMarket)
}
</script>

<template>
  <AppCard class="match-card">
    <button type="button" class="match-card__header" @click="emit('toggleHistory')">
      <span class="match-card__teams">
        <span class="team-line">
          <span class="team-badge team-badge--home">主</span>
          <strong class="team-name team-name--home" :title="match.homeTeam">{{ match.homeTeam }}</strong>
          <span class="versus">VS</span>
          <span class="team-badge team-badge--away">客</span>
          <strong class="team-name team-name--away" :title="match.awayTeam">{{ match.awayTeam }}</strong>
        </span>
        <span class="match-meta">{{ match.matchNum }} · {{ match.payload.league }} · {{ match.matchDateTime }}</span>
      </span>
      <span class="history-summary">
        <strong>
          <span>{{ summary.wins }}胜</span> · <b>{{ summary.draws }}平</b> · <em>{{ summary.losses }}负</em>
        </strong>
        <small>{{ summary.perspective }}视角 · 胜率 {{ summary.winRate }}%</small>
      </span>
      <AppIcon :name="expanded ? 'chevron-up' : 'chevron-down'" :size="16" />
    </button>

    <div v-if="expanded && activeMarket !== 'mixed'" class="history-panel">
      <div v-if="match.payload.history.length" class="history-list">
        <div class="history-row history-row--head">
          <span>日期/赛事</span><span>主队</span><span>半场</span><span>全场</span><span>客队</span>
        </div>
        <div v-for="row in match.payload.history" :key="`${row.date}-${row.homeTeam}-${row.awayTeam}`" class="history-row">
          <span><b>{{ row.date }}</b><small>{{ row.tournament }}</small></span>
          <span :class="row.homeTeamRole === 'currentHome' ? 'same-home' : row.homeTeamRole === 'currentAway' ? 'same-away' : ''">{{ row.homeTeam }}</span>
          <span class="numeric">{{ row.halfTimeScore || '-' }}</span>
          <strong class="numeric">{{ row.score || '-' }}</strong>
          <span :class="row.awayTeamRole === 'currentHome' ? 'same-home' : row.awayTeamRole === 'currentAway' ? 'same-away' : ''">{{ row.awayTeam }}</span>
        </div>
      </div>
      <p v-else class="history-empty">暂无历史交锋记录</p>
    </div>

    <div v-if="activeMarket === 'had-hhad'" class="dual-market">
      <section class="market-section">
        <h3>胜平负</h3>
        <MarketGrid
          :match-id="match.matchId"
          market="had"
          :pool="match.payload.odds.had"
          :selected-keys="selectedKeys"
          @select="emit('select', $event)"
        />
      </section>
      <section class="market-section">
        <h3>让球 <span>{{ match.payload.odds.hhad.goalLine || match.payload.odds.hhad.goalLineValue }}</span></h3>
        <MarketGrid
          :match-id="match.matchId"
          market="hhad"
          :pool="match.payload.odds.hhad"
          :selected-keys="selectedKeys"
          @select="emit('select', $event)"
        />
      </section>
    </div>

    <section v-else-if="activeMarket !== 'mixed'" class="market-section">
      <MarketGrid
        :match-id="match.matchId"
        :market="activeMarket"
        :pool="match.payload.odds[activeMarket]"
        :selected-keys="selectedKeys"
        @select="emit('select', $event)"
      />
    </section>

    <div v-else-if="expanded" class="mixed-market">
      <div class="mixed-result">
        <section class="market-section">
          <h3>胜平负/让球</h3>
          <MarketGrid :match-id="match.matchId" market="had" :pool="match.payload.odds.had" :selected-keys="selectedKeys" @select="emit('select', $event)" />
        </section>
        <section class="market-section">
          <h3>让球 <span>{{ match.payload.odds.hhad.goalLine || match.payload.odds.hhad.goalLineValue }}</span></h3>
          <MarketGrid :match-id="match.matchId" market="hhad" :pool="match.payload.odds.hhad" :selected-keys="selectedKeys" @select="emit('select', $event)" />
        </section>
      </div>

      <section v-for="section in mixedSections" :key="section.key" class="mixed-section">
        <button type="button" class="mixed-section__header" @click="toggleMixedSection(section)">
          <strong>{{ section.label }}</strong>
          <AppIcon :name="expandedMixedSection === section.key ? 'chevron-up' : 'chevron-down'" :size="16" />
        </button>
        <div v-if="expandedMixedSection === section.key" class="mixed-section__content">
          <MarketGrid
            :match-id="match.matchId"
            :market="section.openMarket"
            :pool="match.payload.odds[section.openMarket]"
            :selected-keys="selectedKeys"
            @select="emit('select', $event)"
          />
        </div>
      </section>
    </div>
  </AppCard>
</template>

<style scoped>
.match-card {
  display: grid;
  gap: var(--space-2);
}

.match-card__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(112px, auto) 18px;
  align-items: start;
  gap: var(--space-2);
  width: 100%;
  min-height: 64px;
  padding: 0;
  border: 0;
  color: var(--color-text);
  background: transparent;
  text-align: left;
}

.match-card__teams,
.history-summary {
  display: grid;
  min-width: 0;
}

.team-line {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 5px;
}

.team-badge {
  display: inline-grid;
  flex: 0 0 22px;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  place-items: center;
  font-size: 11px;
  font-weight: 700;
}

.team-badge--home {
  color: #3275b8;
  background: #eaf5ff;
}

.team-badge--away {
  color: #c96b3d;
  background: #fff2e9;
}

.team-name {
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  font-size: 14px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.team-name--home,
.same-home {
  color: #397ec0 !important;
}

.team-name--away,
.same-away {
  color: #c86c3d !important;
}

.versus {
  color: var(--color-text-tertiary);
  font-size: 12px;
}

.match-meta {
  margin-top: 6px;
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 1.4;
}

.history-summary {
  width: auto;
  min-width: 112px;
  max-width: 120px;
  justify-items: end;
  gap: 4px;
  text-align: right;
}

.history-summary strong {
  font-size: 14px;
  line-height: 1.3;
  white-space: nowrap;
}

.history-summary strong span {
  color: var(--color-success);
}

.history-summary strong b {
  color: var(--color-warning);
  font-weight: inherit;
}

.history-summary strong em {
  color: var(--color-danger);
  font-style: normal;
}

.history-summary small {
  max-width: 120px;
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 9px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dual-market {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
}

.market-section {
  display: grid;
  min-width: 0;
  gap: var(--space-2);
}

.market-section h3 {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  margin: 0;
  border-radius: var(--radius-xs);
  color: var(--color-accent-strong);
  background: linear-gradient(90deg, #fff7fa, var(--color-accent-soft));
  font-size: var(--font-size-sm);
  line-height: 1.3;
  text-align: center;
  white-space: nowrap;
}

.market-section h3 span {
  margin-left: 4px;
}

.history-panel {
  padding: var(--space-3);
  border-radius: var(--radius-control);
  background: var(--color-surface-soft);
  box-shadow: var(--outline-default);
}

.history-list {
  display: grid;
  gap: 1px;
  overflow-x: auto;
}

.history-row {
  display: grid;
  grid-template-columns: 88px minmax(68px, 1fr) 40px 40px minmax(68px, 1fr);
  align-items: center;
  min-width: 350px;
  min-height: 38px;
  gap: 5px;
  color: var(--color-text-secondary);
  font-size: 10px;
  text-align: center;
}

.history-row > span:first-child {
  display: grid;
  text-align: left;
}

.history-row small {
  color: var(--color-text-tertiary);
}

.history-row strong {
  color: var(--color-text);
}

.history-row--head {
  min-height: 28px;
  color: var(--color-text-tertiary);
  border-bottom: 1px solid var(--color-divider);
}

.history-empty {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  text-align: center;
}

.mixed-market {
  display: grid;
  gap: 5px;
}

.mixed-result {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 6px;
  border-radius: var(--radius-xs);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
}

.mixed-result::after {
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: 50%;
  width: 1px;
  background: var(--color-divider);
  content: '';
}

.mixed-result .market-section {
  gap: 5px;
}

.mixed-result .market-section h3 {
  justify-content: flex-start;
  min-height: 28px;
  padding: 0 6px;
  border-radius: 0;
  color: var(--color-text);
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
}

.mixed-result :deep(.odds-grid--result .odds-cell) {
  min-height: 46px;
}

.mixed-section {
  overflow: hidden;
  border-radius: var(--radius-xs);
  background: var(--color-surface-soft);
  box-shadow: var(--outline-default);
}

.mixed-section__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 16px;
  align-items: center;
  width: 100%;
  min-height: 40px;
  gap: 6px;
  padding: 0 10px;
  border: 0;
  color: var(--color-text);
  background: transparent;
  text-align: left;
}

.mixed-section__header strong {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mixed-section__content {
  padding: 6px;
  border-top: 1px solid var(--color-divider);
  background: var(--color-surface);
}

.mixed-section__content > .dual-market {
  gap: 5px;
}

@media (max-width: 374px) {
  .match-card__header {
    grid-template-columns: minmax(0, 1fr) 104px 18px;
  }

  .history-summary {
    min-width: 104px;
    max-width: 104px;
  }

  .dual-market {
    gap: var(--space-2);
  }
}
</style>
