<script setup lang="ts">
import { showFailToast, showSuccessToast } from 'vant'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import loadEditIcon from '@/assets/ui/plans/ic_load_edit.svg?url'
import renameIcon from '@/assets/ui/plans/ic_rename.svg?url'
import deleteIcon from '@/assets/ui/plans/ic_delete_danger.svg?url'
import AppBottomSheet from '@/components/base/AppBottomSheet.vue'
import AppButton from '@/components/base/AppButton.vue'
import AppCard from '@/components/base/AppCard.vue'
import AppIcon from '@/components/base/AppIcon.vue'
import AppIconButton from '@/components/base/AppIconButton.vue'
import AppInlineEditor from '@/components/base/AppInlineEditor.vue'
import AppState from '@/components/base/AppState.vue'
import { confirmAction } from '@/components/base/confirmAction'
import SubpageHeader from '@/components/base/SubpageHeader.vue'
import {
  calculatePrizeRange,
  enumeratePlanBets,
  groupPlanBetsByMatches,
  groupSelections,
} from '@/features/betting/calculator'
import { PLAN_NAME_MAX_LENGTH } from '@/features/plans/planName'
import { usePlanStore } from '@/stores/plans'
import { useTicketStore } from '@/stores/ticket'
import type { PlanSelection } from '@/types/domain'
import { centsToYuan } from '@/utils/money'

const route = useRoute()
const router = useRouter()
const store = usePlanStore()
const ticketStore = useTicketStore()
const planId = computed(() => String(route.params.id ?? ''))
const item = computed(() => store.find(planId.value))
const plan = computed(() => item.value?.plan)
const groups = computed(() => (plan.value ? [...groupSelections(plan.value.selections)] : []))
const bets = computed(() => (plan.value ? enumeratePlanBets(plan.value) : []))
const combinationCount = computed(() =>
  plan.value ? groupPlanBetsByMatches(bets.value, plan.value.multiplier).length : 0,
)
const prizeRange = computed(() =>
  plan.value
    ? calculatePrizeRange(plan.value.selections, plan.value.passCounts, plan.value.multiplier)
    : { minCents: 0, maxCents: 0 },
)
const showMenu = ref(false)
const renaming = ref(false)
const renameValue = ref('')
const showLoad = ref(false)
const saveState = ref<'idle' | 'saving' | 'saved'>('idle')
const showSavedToast = ref(false)
let saveResetTimer: ReturnType<typeof setTimeout> | undefined
let toastTimer: ReturnType<typeof setTimeout> | undefined

onMounted(async () => {
  if (!store.plans.length) await store.load()
})

onBeforeUnmount(() => {
  if (saveResetTimer) clearTimeout(saveResetTimer)
  if (toastTimer) clearTimeout(toastTimer)
})

function outcomeLabel(selection: PlanSelection): string {
  if (selection.market === 'had' || selection.market === 'hhad') {
    return { h: '胜', d: '平', a: '负' }[selection.outcome] ?? selection.outcome
  }
  if (selection.market === 'hafu') {
    const labels: Record<string, string> = { h: '胜', d: '平', a: '负' }
    const [half, full] = selection.outcome.split('-')
    return `${labels[half ?? ''] ?? half}${labels[full ?? ''] ?? full}`
  }
  return selection.outcome
}

function selectionLabel(selection: PlanSelection): string {
  const outcome = outcomeLabel(selection)
  if (selection.market === 'ttg') return `总进球 ${outcome}`
  if (selection.market === 'crs') return `比分 ${outcome}`
  if (selection.market === 'hhad') return `让球胜平负 · ${outcome}`
  if (selection.market === 'hafu') return `半全场 · ${outcome}`
  return `胜平负 · ${outcome}`
}

function matchTime(matchId: number): string {
  const value = store.matchById.get(matchId)?.matchDateTime || ''
  const match = value.match(/(\d{2}-\d{2})\s+(\d{2}:\d{2})/)
  return match ? `${match[1]} ${match[2]}` : value
}

function matchLeague(matchId: number): string {
  return store.matchById.get(matchId)?.payload.league || ''
}

function requestLoad(): void {
  if (!plan.value) return
  showMenu.value = false
  if (ticketStore.hasUnsavedChanges) {
    showLoad.value = true
    return
  }
  store.loadIntoTicket(plan.value)
  router.push('/ticket')
}

async function applyLoad(saveCurrent: boolean): Promise<void> {
  if (!plan.value) return
  try {
    if (saveCurrent) await ticketStore.savePlan()
    store.loadIntoTicket(plan.value)
    showLoad.value = false
    await router.push('/ticket')
  } catch (reason) {
    showFailToast(reason instanceof Error ? reason.message : String(reason))
  }
}

function beginRename(): void {
  if (!plan.value) return
  renameValue.value = plan.value.name
  renaming.value = true
  showMenu.value = false
}

async function saveRename(): Promise<void> {
  if (!plan.value || !renameValue.value.trim()) return
  try {
    await store.rename(plan.value, renameValue.value)
    renaming.value = false
    showSuccessToast('方案已改名')
  } catch (reason) {
    showFailToast(reason instanceof Error ? reason.message : String(reason))
  }
}

async function savePlan(): Promise<void> {
  if (!plan.value || saveState.value !== 'idle') return
  saveState.value = 'saving'
  try {
    await store.load()
    if (!store.find(planId.value)) throw new Error('方案不存在或已被删除')
    saveState.value = 'saved'
    showSavedToast.value = true
    toastTimer = setTimeout(() => {
      showSavedToast.value = false
    }, 1800)
    saveResetTimer = setTimeout(() => {
      saveState.value = 'idle'
    }, 2200)
  } catch (reason) {
    saveState.value = 'idle'
    showFailToast(reason instanceof Error ? reason.message : String(reason))
  }
}

async function deletePlan(): Promise<void> {
  if (!plan.value) return
  const current = plan.value
  showMenu.value = false
  try {
    await confirmAction({
      title: '删除方案？',
      message: `确定删除“${current.name}”吗？已有购买账单快照不会受到影响。`,
      confirmText: '删除',
      danger: true,
    })
    await store.remove(current.id)
    showSuccessToast('方案已删除')
    await router.replace('/plans')
  } catch {
    // User cancelled.
  }
}
</script>

<template>
  <div class="plan-detail-page" @click="showMenu = false">
    <SubpageHeader title="方案详情">
      <template #action>
        <AppIconButton
          class="detail-more"
          label="更多方案操作"
          icon="more"
          variant="plain"
          :aria-expanded="showMenu"
          @click.stop="showMenu = !showMenu"
        />
      </template>
    </SubpageHeader>

    <Transition name="detail-menu">
      <div v-if="showMenu && plan" class="detail-menu" @click.stop>
        <button type="button" @click="requestLoad">
          <img :src="loadEditIcon" alt="" aria-hidden="true" />
          <span>继续选号</span>
        </button>
        <button type="button" @click="beginRename">
          <img :src="renameIcon" alt="" aria-hidden="true" />
          <span>重命名方案</span>
        </button>
        <button type="button" class="danger" @click="deletePlan">
          <img :src="deleteIcon" alt="" aria-hidden="true" />
          <span>删除方案</span>
        </button>
      </div>
    </Transition>

    <main class="plan-detail-content">
      <AppState v-if="store.loading && !plan" type="loading" title="正在读取方案" />
      <AppState
        v-else-if="!plan"
        type="error"
        title="方案不存在"
        description="方案可能已被删除"
        action-text="返回方案管理"
        @action="router.replace('/plans')"
      />

      <template v-else>
        <AppInlineEditor
          v-if="renaming"
          v-model="renameValue"
          label="方案名称"
          :max-length="PLAN_NAME_MAX_LENGTH"
          @save="saveRename"
          @cancel="renaming = false"
        />

        <AppCard v-if="item?.evaluation" class="detail-summary">
          <div><span>比赛</span><strong>{{ item.evaluation.totalMatches }}场</strong></div>
          <div><span>过关</span><strong>{{ plan.passCounts.join('/') }}关</strong></div>
          <div><span>倍数</span><strong>{{ plan.multiplier }}倍</strong></div>
          <div><span>注数</span><strong>{{ bets.length }}</strong></div>
        </AppCard>

        <section class="detail-section">
          <div class="detail-section-heading">
            <h2>比赛明细</h2>
            <span>共{{ groups.length }}场</span>
          </div>
          <AppCard class="selection-list" :padded="false">
            <div v-for="[matchId, selections] in groups" :key="matchId" class="selection-card">
              <div class="selection-copy">
                <small>{{ store.matchById.get(matchId)?.matchNum || matchId }}</small>
                <h3>
                  {{ store.matchById.get(matchId)?.homeTeam || matchId }} VS
                  {{ store.matchById.get(matchId)?.awayTeam || '未知球队' }}
                </h3>
                <p>
                  <span v-if="matchLeague(matchId)">{{ matchLeague(matchId) }}</span>
                  <span>{{ matchTime(matchId) }}</span>
                </p>
              </div>
              <div class="selection-options">
                <span v-for="selection in selections" :key="selection.key" class="selection-option">
                  <span>{{ selectionLabel(selection) }}</span>
                  <b class="numeric">{{ selection.odds }}</b>
                </span>
              </div>
            </div>
          </AppCard>
        </section>

        <button type="button" class="combination-entry" @click="router.push(`/plans/${plan.id}/combinations`)">
          <span>过关组合明细</span>
          <b>{{ combinationCount }}组</b>
          <AppIcon name="chevron-right" :size="18" />
        </button>
      </template>
    </main>

    <div v-if="plan && item?.evaluation" class="detail-actions">
      <div class="detail-finance">
        <p>
          <strong class="numeric">{{ bets.length }}</strong><span>注 · 投注</span>
          <strong class="numeric">¥{{ centsToYuan(item.evaluation.stakeCents) }}</strong>
        </p>
        <p>
          <span>理论奖金</span>
          <strong class="numeric">¥{{ centsToYuan(prizeRange.minCents) }}～¥{{ centsToYuan(prizeRange.maxCents) }}</strong>
        </p>
      </div>
      <AppButton
        class="save-plan-button"
        :loading="saveState === 'saving'"
        :disabled="saveState === 'saved'"
        @click="savePlan"
      >
        <template v-if="saveState === 'saved'" #icon><AppIcon name="success" :size="19" /></template>
        {{ saveState === 'saved' ? '已保存' : '保存方案' }}
      </AppButton>
    </div>

    <Transition name="save-toast">
      <div v-if="showSavedToast" class="saved-toast" role="status">
        <AppIcon name="success" :size="20" />
        <span>方案已保存，可在方案管理中查看</span>
      </div>
    </Transition>

    <AppBottomSheet v-model:show="showLoad" :title="`载入“${plan?.name || ''}”`" description="载入后将替换当前临时选票">
      <div class="load-sheet">
        <p>当前选票已有 {{ ticketStore.selectedMatchCount }} 场，载入后将替换当前临时内容。</p>
        <AppButton block @click="applyLoad(true)">保存当前方案后载入</AppButton>
        <AppButton block variant="secondary" @click="applyLoad(false)">放弃当前内容并载入</AppButton>
      </div>
    </AppBottomSheet>
  </div>
</template>

<style scoped>
.plan-detail-page {
  min-height: 100dvh;
  background: var(--color-page);
}

.detail-more {
  position: relative;
  width: 44px;
  height: 44px;
  color: var(--color-text);
  background: transparent;
  box-shadow: none;
}

.detail-more::before {
  position: absolute;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--color-surface);
  box-shadow: var(--outline-default);
  content: '';
}

.detail-more :deep(.app-icon) {
  position: relative;
  width: 22px;
  height: 22px;
}

.detail-menu {
  position: fixed;
  z-index: 70;
  top: calc(48px + env(safe-area-inset-top));
  right: var(--page-gutter);
  display: grid;
  width: 132px;
  overflow: visible;
  border-radius: 10px;
  background: var(--color-surface);
  box-shadow:
    var(--outline-default),
    0 8px 24px rgb(52 78 112 / 14%);
}

.detail-menu::before {
  position: absolute;
  top: -6px;
  right: 14px;
  width: 12px;
  height: 12px;
  content: '';
  background: var(--color-surface);
  box-shadow: inset 1px 1px 0 var(--color-border);
  transform: rotate(45deg);
}

.detail-menu button {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  align-items: center;
  min-height: 42px;
  gap: 8px;
  padding: 0 12px;
  border: 0;
  color: var(--color-text);
  background: transparent;
  font-size: 13px;
  text-align: left;
}

.detail-menu button:first-child {
  border-radius: 10px 10px 0 0;
}

.detail-menu button:last-child {
  border-radius: 0 0 10px 10px;
}

.detail-menu button + button {
  border-top: 1px solid var(--color-divider);
}

.detail-menu button:active {
  background: var(--color-surface-soft);
}

.detail-menu img {
  width: 20px;
  height: 20px;
}

.detail-menu .danger {
  color: var(--color-danger);
}

.detail-menu-enter-active,
.detail-menu-leave-active {
  transition:
    opacity 150ms ease,
    transform 150ms ease;
  transform-origin: top right;
}

.detail-menu-enter-from,
.detail-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.97);
}

.plan-detail-content {
  display: grid;
  gap: 12px;
  padding: 12px var(--page-gutter) calc(88px + env(safe-area-inset-bottom));
}

.detail-summary {
  display: grid;
  grid-template-columns: 0.9fr 1.35fr 0.8fr 0.8fr;
  min-height: 68px;
  padding: 10px 6px;
}

.detail-summary div {
  display: grid;
  min-width: 0;
  align-content: center;
  gap: 5px;
  padding-inline: 4px;
  text-align: center;
}

.detail-summary div + div {
  border-left: 1px solid var(--color-divider);
}

.detail-summary span {
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-summary strong {
  overflow: hidden;
  font-size: 14px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-section {
  display: grid;
  gap: 8px;
}

.detail-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
  padding-inline: 6px;
}

.detail-section-heading h2 {
  margin: 0;
  font-size: 15px;
  line-height: 21px;
}

.detail-section-heading span {
  color: var(--color-text-secondary);
  font-size: 11px;
}

.selection-list {
  display: grid;
}

.selection-card {
  display: grid;
  grid-template-columns: 52% 48%;
  align-items: stretch;
  min-height: 76px;
  padding: 0 10px;
}

.selection-card + .selection-card {
  border-top: 1px solid var(--color-divider);
}

.selection-copy {
  display: grid;
  min-width: 0;
  align-content: center;
  gap: 3px;
  padding-right: 8px;
}

.selection-copy h3,
.selection-copy p {
  margin: 0;
}

.selection-copy > small {
  color: var(--color-primary);
  font-size: 11px;
  line-height: 16px;
}

.selection-copy h3 {
  overflow: hidden;
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selection-copy p {
  display: flex;
  min-width: 0;
  gap: 8px;
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selection-options {
  display: grid;
  align-content: center;
  gap: 6px;
  padding: 8px 0 8px 10px;
  border-left: 1px solid var(--color-divider);
}

.selection-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  min-height: 30px;
  gap: 6px;
  padding: 0 9px;
  border-radius: 4px;
  color: var(--color-text);
  background: #f8fbff;
  box-shadow: var(--outline-default);
  font-size: 11px;
}

.selection-option > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selection-option b {
  flex: 0 0 auto;
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 500;
}

.combination-entry {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 18px;
  align-items: center;
  min-height: 48px;
  gap: 8px;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  color: var(--color-text);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
  font-size: 13px;
  text-align: left;
}

.combination-entry b {
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 400;
}

.detail-actions {
  position: fixed;
  z-index: 40;
  right: 0;
  bottom: 0;
  left: 0;
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(128px, 2fr);
  align-items: center;
  gap: 12px;
  min-height: calc(76px + env(safe-area-inset-bottom));
  padding: 8px var(--page-gutter) calc(8px + env(safe-area-inset-bottom));
  background: rgb(255 255 255 / 97%);
  border-top: 1px solid var(--color-border);
  box-shadow: 0 -4px 16px rgb(70 112 164 / 5%);
}

.detail-finance {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.detail-finance p {
  display: flex;
  min-width: 0;
  gap: 4px;
  margin: 0;
  overflow: hidden;
  font-size: 11px;
  line-height: 18px;
  white-space: nowrap;
}

.detail-finance span {
  color: var(--color-text-secondary);
}

.detail-finance strong {
  color: var(--color-danger);
  font-size: 13px;
  font-weight: 500;
}

.save-plan-button {
  width: 100%;
}

.saved-toast {
  position: fixed;
  z-index: 90;
  bottom: calc(92px + env(safe-area-inset-bottom));
  left: 50%;
  display: flex;
  align-items: center;
  max-width: calc(100% - 48px);
  min-height: 46px;
  gap: 8px;
  padding: 0 16px;
  border-radius: 8px;
  color: #fff;
  background: rgb(33 42 60 / 94%);
  box-shadow: 0 8px 24px rgb(22 34 54 / 20%);
  font-size: 12px;
  white-space: nowrap;
  transform: translateX(-50%);
}

.save-toast-enter-active,
.save-toast-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.save-toast-enter-from,
.save-toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}

.load-sheet {
  display: grid;
  gap: 12px;
  padding: 12px var(--page-gutter) calc(12px + env(safe-area-inset-bottom));
}

.load-sheet p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 1.5;
}

@media (min-width: 600px) {
  .detail-actions {
    right: 50%;
    left: 50%;
    width: 520px;
    transform: translateX(-50%);
  }
}

@media (max-width: 359px) {
  .detail-summary {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .detail-summary span {
    font-size: 9px;
  }

  .detail-finance p {
    font-size: 10px;
  }
}
</style>
