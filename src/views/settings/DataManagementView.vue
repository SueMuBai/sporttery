<script setup lang="ts">
import { showFailToast, showLoadingToast, showSuccessToast } from "vant";
import { computed, onMounted, ref } from "vue";

import exportJsonIcon from "@/assets/ui/settings/ic_export_json.svg?url";
import exportMarkdownIcon from "@/assets/ui/settings/ic_export_markdown.svg?url";
import dataBackupIcon from "@/assets/ui/settings/ic_data_backup.svg?url";
import AppAssetIcon from "@/components/base/AppAssetIcon.vue";
import AppBottomSheet from "@/components/base/AppBottomSheet.vue";
import AppButton from "@/components/base/AppButton.vue";
import AppCard from "@/components/base/AppCard.vue";
import AppIcon from "@/components/base/AppIcon.vue";
import AppPage from "@/components/base/AppPage.vue";
import AppRowChevron from "@/components/base/AppRowChevron.vue";
import SubpageHeader from "@/components/base/SubpageHeader.vue";
import { confirmAction } from "@/components/base/confirmAction";
import { getDatabase } from "@/services/database/createDatabase";
import {
  createExportBundle,
  exportFilename,
  parseBackupImport,
  restoreBackupFromJson,
  saveTextFile,
  serializeJsonExport,
  serializeMarkdownExport,
  type BackupPreview,
} from "@/services/export/exportData";
import type { DatabaseCounts } from "@/types/domain";

const exporting = ref<"markdown" | "json">();
const importing = ref(false);
const fileInput = ref<HTMLInputElement>();
const counts = ref<DatabaseCounts>();
const lastBackupAt = ref(localStorage.getItem("caiguo.lastBackupAt") || "");
const localDataSizes = ref({ matchesAndPlans: "读取中", ledgerAndTags: "读取中" });
const helpVisible = ref(false);
const dataInfoVisible = ref(false);
const dataInfoSection = ref<"matches" | "ledger" | "backup">("matches");
const restoreSheetVisible = ref(false);
const restorePhrase = ref("");
const pendingRestore = ref<{ content: string; preview: BackupPreview }>();
const clearSheetVisible = ref(false);
const clearPhrase = ref("");
const clearing = ref(false);
const CLEAR_CONFIRMATION_PHRASE = "清空数据";
const RESTORE_CONFIRMATION_PHRASE = "恢复备份";
const clearPhraseMatches = computed(
  () => clearPhrase.value === CLEAR_CONFIRMATION_PHRASE,
);
const restorePhraseMatches = computed(
  () => restorePhrase.value === RESTORE_CONFIRMATION_PHRASE,
);
const clearSummary = computed(() => {
  if (!counts.value) return "本机保存的全部业务数据";
  return `${counts.value.matches} 场比赛、${counts.value.plans} 个方案、${counts.value.ledgerOrders} 笔账单和 ${counts.value.tags} 个标签`;
});
const restoreSummary = computed(() => {
  const snapshot = pendingRestore.value?.preview.snapshot;
  if (!snapshot) return "";
  return `${snapshot.matches.length} 场比赛、${snapshot.plans.length} 个方案、${snapshot.ledgerOrders.length} 笔账单、${snapshot.tags.length} 个标签和 ${snapshot.ledgerAdjustments.length} 条回款修改记录`;
});
const dataInfo = computed(() => {
  if (dataInfoSection.value === "matches") {
    return {
      title: "比赛与方案",
      description: "用于选票、方案详情与结算的赛事数据",
      body: counts.value
        ? `本机保存 ${counts.value.matches} 场比赛、${counts.value.results} 条赛果、${counts.value.plans} 个方案和 ${counts.value.planSelections} 个投注选项。`
        : "正在读取本机数据。",
    };
  }
  if (dataInfoSection.value === "ledger") {
    return {
      title: "账单与标签",
      description: "长期账单、回款记录和方案分类",
      body: counts.value
        ? `本机保存 ${counts.value.ledgerOrders} 笔账单和 ${counts.value.tags} 个标签；完整备份还会包含回款修改历史。`
        : "正在读取本机数据。",
    };
  }
  return {
    title: "最后备份",
    description: "最近一次生成完整 JSON 备份的时间",
    body: lastBackupAt.value
      ? `最近备份于 ${formatBackupTime(lastBackupAt.value)}。建议在批量修改方案或账单前重新备份。`
      : "尚未生成完整备份，建议立即备份本机数据。",
  };
});

onMounted(async () => {
  try {
    const database = getDatabase();
    await database.initialize();
    const [nextCounts, snapshot] = await Promise.all([
      database.getCounts(),
      database.createBackupSnapshot(),
    ]);
    counts.value = nextCounts;
    localDataSizes.value = {
      matchesAndPlans: formatBytes(
        byteSize({
          plans: snapshot.plans,
          matches: snapshot.matches,
          results: snapshot.results,
          oddsHistory: snapshot.oddsHistory,
          syncJobs: snapshot.syncJobs,
        }),
      ),
      ledgerAndTags: formatBytes(
        byteSize({
          settings: snapshot.settings,
          tags: snapshot.tags,
          ledgerOrders: snapshot.ledgerOrders,
          ledgerAdjustments: snapshot.ledgerAdjustments,
          appEvents: snapshot.appEvents,
        }),
      ),
    };
  } catch {
    counts.value = undefined;
    localDataSizes.value = {
      matchesAndPlans: "读取失败",
      ledgerAndTags: "读取失败",
    };
  }
});

function byteSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value}B`;
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))}KB`;
  return `${(value / 1024 / 1024).toFixed(1)}MB`;
}

function formatBackupTime(value: string): string {
  if (!value) return "尚未备份";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

async function exportData(type: "markdown" | "json"): Promise<void> {
  exporting.value = type;
  const toast = showLoadingToast({
    message: "正在生成文件…",
    forbidClick: true,
    duration: 0,
  });
  try {
    const bundle = await createExportBundle();
    const markdown = type === "markdown";
    const filename = exportFilename(markdown ? "md" : "json");
    const result = await saveTextFile(
      filename,
      markdown ? serializeMarkdownExport(bundle) : serializeJsonExport(bundle),
      markdown
        ? "text/markdown;charset=utf-8"
        : "application/json;charset=utf-8",
    );
    if (type === "json") {
      const completedAt = new Date().toISOString();
      localStorage.setItem("caiguo.lastBackupAt", completedAt);
      lastBackupAt.value = completedAt;
    }
    showSuccessToast(`已生成 ${result.filename}`);
  } catch (reason) {
    showFailToast(reason instanceof Error ? reason.message : String(reason));
  } finally {
    exporting.value = undefined;
    toast.close();
  }
}

async function importFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  importing.value = true;
  try {
    const content = await file.text();
    const preview = parseBackupImport(content);
    pendingRestore.value = { content, preview };
    restorePhrase.value = "";
    restoreSheetVisible.value = true;
  } catch (reason) {
    if (reason === "cancel" || reason === "close") return;
    showFailToast(reason instanceof Error ? reason.message : String(reason));
  } finally {
    importing.value = false;
  }
}

function updateRestoreSheetVisibility(visible: boolean): void {
  if (importing.value) return;
  restoreSheetVisible.value = visible;
  if (!visible) {
    restorePhrase.value = "";
    pendingRestore.value = undefined;
  }
}

async function restoreBackup(): Promise<void> {
  if (!pendingRestore.value || !restorePhraseMatches.value || importing.value) {
    return;
  }
  importing.value = true;
  const toast = showLoadingToast({
    message: "正在恢复完整备份…",
    forbidClick: true,
    duration: 0,
  });
  try {
    const { content, preview } = pendingRestore.value;
    counts.value = await restoreBackupFromJson(content);
    localStorage.setItem("caiguo.lastBackupAt", preview.exportedAt);
    localStorage.removeItem("caiguo.ticket-draft.v1");
    lastBackupAt.value = preview.exportedAt;
    restoreSheetVisible.value = false;
    pendingRestore.value = undefined;
    showSuccessToast("完整备份已恢复");
    window.setTimeout(() => window.location.reload(), 650);
  } catch (reason) {
    showFailToast({
      message: reason instanceof Error ? reason.message : String(reason),
      duration: 3000,
    });
  } finally {
    importing.value = false;
    toast.close();
  }
}

function showDataInfo(section: "matches" | "ledger" | "backup"): void {
  dataInfoSection.value = section;
  dataInfoVisible.value = true;
}

async function requestClearLocalData(): Promise<void> {
  try {
    await confirmAction({
      title: "清空本机数据？",
      message: `将删除${clearSummary.value}，并把系统设置恢复为默认值。此操作不可撤销，建议先导出 JSON 备份。`,
      confirmText: "继续",
      cancelText: "取消",
      danger: true,
    });
    clearPhrase.value = "";
    clearSheetVisible.value = true;
  } catch (reason) {
    if (reason === "cancel" || reason === "close") return;
    showFailToast(reason instanceof Error ? reason.message : String(reason));
  }
}

function updateClearSheetVisibility(visible: boolean): void {
  if (clearing.value) return;
  clearSheetVisible.value = visible;
  if (!visible) clearPhrase.value = "";
}

async function clearLocalData(): Promise<void> {
  if (!clearPhraseMatches.value || clearing.value) return;
  clearing.value = true;
  try {
    const database = getDatabase();
    await database.initialize();
    counts.value = await database.clearLocalData();
    localStorage.removeItem("caiguo.lastBackupAt");
    localStorage.removeItem("caiguo.ticket-draft.v1");
    lastBackupAt.value = "";
    clearSheetVisible.value = false;
    showSuccessToast("本机数据已清空");
    window.setTimeout(() => window.location.reload(), 650);
  } catch (reason) {
    showFailToast({
      message: reason instanceof Error ? reason.message : String(reason),
      duration: 3000,
    });
  } finally {
    clearing.value = false;
  }
}
</script>

<template>
  <AppPage secondary content-class="data-content">
    <template #header>
      <SubpageHeader title="数据与备份">
        <template #action>
          <button type="button" class="header-help" @click="helpVisible = true">
            帮助
          </button>
        </template>
      </SubpageHeader>
    </template>
    <section class="data-section">
      <h2>本机数据</h2>
      <AppCard class="data-list" :padded="false">
        <button
          type="button"
          class="data-row data-row--summary"
          aria-label="查看比赛与方案数据说明"
          @click="showDataInfo('matches')"
        >
          <span class="data-row__icon">
            <AppIcon name="folder" :size="22" />
          </span>
          <span class="data-row__copy"><strong>比赛与方案</strong></span>
          <span class="data-row__value">{{ localDataSizes.matchesAndPlans }}</span>
          <AppRowChevron />
        </button>
        <button
          type="button"
          class="data-row data-row--summary"
          aria-label="查看账单与标签数据说明"
          @click="showDataInfo('ledger')"
        >
          <span class="data-row__icon data-row__icon--import">
            <AppIcon name="tag" :size="22" />
          </span>
          <span class="data-row__copy"><strong>账单与标签</strong></span>
          <span class="data-row__value">{{ localDataSizes.ledgerAndTags }}</span>
          <AppRowChevron />
        </button>
        <button
          type="button"
          class="data-row data-row--summary"
          aria-label="查看最后备份时间"
          @click="showDataInfo('backup')"
        >
          <span class="data-row__icon data-row__icon--history">
            <AppIcon name="history" :size="22" />
          </span>
          <span class="data-row__copy"><strong>最后备份</strong></span>
          <span class="data-row__value">{{
            formatBackupTime(lastBackupAt)
          }}</span>
          <AppRowChevron />
        </button>
      </AppCard>
    </section>
    <section class="data-section">
      <h2>导出</h2>
      <AppCard class="data-list" :padded="false">
        <button
          type="button"
          class="data-row"
          :disabled="Boolean(exporting)"
          @click="exportData('markdown')"
        >
          <span class="data-row__icon data-row__icon--markdown">
            <AppAssetIcon :src="exportMarkdownIcon" :size="22" />
          </span>
          <span class="data-row__copy">
            <strong>导出 Markdown</strong>
            <small>比赛、方案与账单摘要</small>
          </span>
          <van-loading v-if="exporting === 'markdown'" size="18" />
          <AppRowChevron v-else />
        </button>
        <button
          type="button"
          class="data-row"
          :disabled="Boolean(exporting)"
          @click="exportData('json')"
        >
          <span class="data-row__icon data-row__icon--json">
            <AppAssetIcon :src="exportJsonIcon" :size="22" />
          </span>
          <span class="data-row__copy">
            <strong>导出 JSON</strong>
            <small>完整结构化数据</small>
          </span>
          <van-loading v-if="exporting === 'json'" size="18" />
          <AppRowChevron v-else />
        </button>
      </AppCard>
    </section>
    <section class="data-section">
      <h2>备份</h2>
      <AppCard class="backup-actions">
        <AppButton
          block
          :loading="exporting === 'json'"
          :disabled="Boolean(exporting)"
          @click="exportData('json')"
        >
          <template #icon>
            <AppAssetIcon :src="dataBackupIcon" :size="20" />
          </template>
          立即备份
        </AppButton>
        <AppButton
          block
          variant="secondary"
          :loading="importing"
          :disabled="Boolean(exporting)"
          @click="fileInput?.click()"
        >
          <template #icon><AppIcon name="refresh" :size="20" /></template>
          从备份恢复
        </AppButton>
      </AppCard>
    </section>
    <section class="data-section data-section--danger">
      <h2>危险操作</h2>
      <AppCard class="danger-card" :padded="false">
        <button type="button" aria-label="清空本机数据" @click="requestClearLocalData">
          <span class="danger-card__icon"><AppIcon name="delete" :size="24" /></span>
          <span class="danger-card__copy">
            <strong>清空本机数据</strong>
            <small>此操作无法撤销，请谨慎操作</small>
          </span>
          <AppRowChevron />
        </button>
      </AppCard>
    </section>
    <input
      ref="fileInput"
      class="file-input"
      type="file"
      accept=".json,application/json"
      aria-label="选择彩果 JSON 备份"
      @change="importFile"
    />
    <AppBottomSheet
      :show="helpVisible"
      title="备份帮助"
      description="完整备份与摘要导出的区别"
      @update:show="helpVisible = $event"
    >
      <div class="help-content">
        <section>
          <strong>立即备份 / 导出 JSON</strong>
          <p>
            保存系统设置、标签、方案、账单、回款修改记录、比赛、全部赛果、赔率历史、同步记录和应用记录，可用于完整恢复。
          </p>
        </section>
        <section>
          <strong>导出 Markdown</strong>
          <p>生成便于阅读和存档的账单摘要，不能用于恢复应用数据。</p>
        </section>
        <section>
          <strong>从备份恢复</strong>
          <p>恢复前会校验整份文件，并以单个数据库事务替换本机数据；任何一步失败都会整体回滚。</p>
        </section>
      </div>
    </AppBottomSheet>
    <AppBottomSheet
      :show="dataInfoVisible"
      :title="dataInfo.title"
      :description="dataInfo.description"
      @update:show="dataInfoVisible = $event"
    >
      <div class="data-info-content">
        <p>{{ dataInfo.body }}</p>
      </div>
    </AppBottomSheet>
    <AppBottomSheet
      :show="restoreSheetVisible"
      title="从备份恢复"
      description="恢复会完整替换当前本机数据"
      :show-close="!importing"
      @update:show="updateRestoreSheetVisibility"
    >
      <div class="restore-confirm">
        <div class="restore-confirm__summary">
          <span><AppIcon name="shield" :size="22" /></span>
          <div>
            <strong>备份已通过完整性校验</strong>
            <p>{{ restoreSummary }}</p>
            <p v-if="pendingRestore?.preview.legacy" class="restore-confirm__legacy">
              这是旧版备份，不包含回款修改、赔率和同步历史；其余数据仍会完整恢复。
            </p>
          </div>
        </div>
        <p class="restore-confirm__warning">
          当前本机设置、标签、方案、账单及关联数据将被备份内容替换。恢复失败时不会保留部分写入。
        </p>
        <label class="clear-confirm__field">
          <span>
            请输入“<strong>{{ RESTORE_CONFIRMATION_PHRASE }}</strong>”确认
          </span>
          <input
            v-model="restorePhrase"
            type="text"
            inputmode="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            :disabled="importing"
            :placeholder="RESTORE_CONFIRMATION_PHRASE"
            :aria-invalid="Boolean(restorePhrase) && !restorePhraseMatches"
            @keyup.enter="restoreBackup"
          />
        </label>
        <p
          v-if="restorePhrase && !restorePhraseMatches"
          class="clear-confirm__error"
          role="status"
        >
          确认词不一致，请完整输入“{{ RESTORE_CONFIRMATION_PHRASE }}”
        </p>
      </div>
      <template #footer>
        <div class="clear-confirm__actions">
          <AppButton
            block
            variant="ghost"
            :disabled="importing"
            @click="updateRestoreSheetVisibility(false)"
          >
            取消
          </AppButton>
          <AppButton
            block
            :loading="importing"
            :disabled="!restorePhraseMatches || importing"
            @click="restoreBackup"
          >
            完整恢复
          </AppButton>
        </div>
      </template>
    </AppBottomSheet>
    <AppBottomSheet
      :show="clearSheetVisible"
      title="最终确认"
      description="这是清空前的第二次确认"
      :show-close="!clearing"
      @update:show="updateClearSheetVisibility"
    >
      <div class="clear-confirm">
        <div class="clear-confirm__warning" role="alert">
          <span class="clear-confirm__warning-icon">
            <AppIcon name="warning" :size="22" />
          </span>
          <div>
            <strong>清空后无法恢复</strong>
            <p>
              {{ clearSummary }}将永久删除；仅能通过此前导出的完整 JSON 备份恢复。
            </p>
          </div>
        </div>
        <label class="clear-confirm__field">
          <span>
            请输入“<strong>{{ CLEAR_CONFIRMATION_PHRASE }}</strong>”确认
          </span>
          <input
            v-model="clearPhrase"
            type="text"
            inputmode="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            :disabled="clearing"
            :placeholder="CLEAR_CONFIRMATION_PHRASE"
            :aria-invalid="Boolean(clearPhrase) && !clearPhraseMatches"
            @keyup.enter="clearLocalData"
          />
        </label>
        <p
          v-if="clearPhrase && !clearPhraseMatches"
          class="clear-confirm__error"
          role="status"
        >
          确认词不一致，请完整输入“{{ CLEAR_CONFIRMATION_PHRASE }}”
        </p>
      </div>
      <template #footer>
        <div class="clear-confirm__actions">
          <AppButton
            block
            variant="ghost"
            :disabled="clearing"
            @click="updateClearSheetVisibility(false)"
          >
            取消
          </AppButton>
          <AppButton
            block
            variant="danger"
            :loading="clearing"
            :disabled="!clearPhraseMatches || clearing"
            @click="clearLocalData"
          >
            永久清空
          </AppButton>
        </div>
      </template>
    </AppBottomSheet>
  </AppPage>
</template>

<style scoped>
.header-help {
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  color: var(--color-primary);
  background: transparent;
  font-size: 14px;
  line-height: 44px;
  text-align: center;
  white-space: nowrap;
}

.data-content {
  align-content: start;
  gap: 18px;
  padding-top: 18px;
}

.data-section {
  display: grid;
  gap: 8px;
}

.data-section h2 {
  margin: 0 4px;
  font-size: 15px;
  line-height: 20px;
}

.data-list {
  display: grid;
}

.data-row {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) 20px;
  align-items: center;
  width: 100%;
  min-height: 58px;
  gap: 8px;
  padding: 6px 10px;
  border: 0;
  color: var(--color-text);
  background: transparent;
  text-align: left;
}

.data-row--summary {
  grid-template-columns: 36px minmax(0, 1fr) auto 20px;
  min-height: 58px;
}

.data-row__value {
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
}

.data-row + .data-row {
  border-top: 1px solid var(--color-divider);
}

.data-row:active:not(:disabled) {
  background: var(--color-surface-soft);
}

.data-row:disabled {
  opacity: 0.65;
}

.data-row__icon {
  display: grid;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-control);
  place-items: center;
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.data-row__icon--markdown {
  color: #ff8fb3;
  background: #fff0f6;
}

.data-row__icon--import {
  color: var(--color-mint);
  background: rgb(97 214 191 / 12%);
}

.data-row__icon--json {
  color: var(--color-violet);
  background: rgb(154 145 245 / 12%);
}

.data-row__icon--history {
  color: var(--color-violet);
  background: rgb(154 145 245 / 12%);
}

.data-row__copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.data-row__copy strong,
.data-row__copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.data-row__copy strong {
  font-size: 14px;
  line-height: 20px;
}

.data-row__copy small {
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 16px;
}

.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.backup-actions {
  display: grid;
  gap: 10px;
  padding: 14px;
}

.help-content,
.data-info-content,
.restore-confirm {
  padding: 16px var(--page-gutter) 22px;
}

.help-content {
  display: grid;
  gap: 12px;
}

.help-content section {
  padding: 12px;
  border-radius: var(--radius-control);
  background: var(--color-surface-soft);
  box-shadow: var(--outline-default);
}

.help-content strong,
.help-content p,
.data-info-content p,
.restore-confirm p {
  margin: 0;
}

.help-content strong {
  font-size: 14px;
  line-height: 20px;
}

.help-content p,
.data-info-content p {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 19px;
}

.restore-confirm {
  display: grid;
  gap: 14px;
}

.restore-confirm__summary {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  align-items: start;
  gap: 10px;
  padding: 12px;
  border-radius: var(--radius-control);
  background: var(--color-primary-soft);
  box-shadow: var(--outline-primary);
}

.restore-confirm__summary > span {
  display: grid;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  color: var(--color-primary);
  background: var(--color-surface);
  place-items: center;
}

.restore-confirm__summary strong {
  color: var(--color-primary);
  font-size: 14px;
  line-height: 20px;
}

.restore-confirm__summary p {
  margin-top: 3px;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 18px;
}

.restore-confirm__summary .restore-confirm__legacy {
  color: var(--color-warning);
}

.restore-confirm__warning {
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 19px;
}

.data-section--danger {
  margin-top: 2px;
}

.data-section--danger h2 {
  color: var(--color-danger);
}

.danger-card {
  overflow: hidden;
}

.danger-card > button {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 20px;
  align-items: center;
  width: 100%;
  min-height: 70px;
  gap: 12px;
  padding: 0 16px;
  border: 0;
  color: var(--color-text);
  background: transparent;
  text-align: left;
}

.danger-card__icon {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  color: var(--color-danger);
}

.danger-card__copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.danger-card__copy strong {
  color: var(--color-danger);
  font-size: 14px;
  line-height: 20px;
}

.danger-card__copy small {
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 16px;
}

.clear-confirm {
  display: grid;
  gap: 14px;
  padding: 16px var(--page-gutter) 18px;
}

.clear-confirm__warning {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  align-items: start;
  gap: 10px;
  padding: 12px;
  border-radius: var(--radius-control);
  background: rgb(239 91 103 / 8%);
  box-shadow: inset 0 0 0 1px rgb(239 91 103 / 22%);
}

.clear-confirm__warning-icon {
  display: grid;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  color: var(--color-danger);
  background: rgb(239 91 103 / 12%);
  place-items: center;
}

.clear-confirm__warning strong,
.clear-confirm__warning p {
  margin: 0;
}

.clear-confirm__warning strong {
  color: var(--color-danger);
  font-size: 14px;
  line-height: 20px;
}

.clear-confirm__warning p {
  margin-top: 3px;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 18px;
}

.clear-confirm__field {
  display: grid;
  gap: 7px;
}

.clear-confirm__field > span {
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 18px;
}

.clear-confirm__field > span strong {
  color: var(--color-text);
}

.clear-confirm__field input {
  width: 100%;
  height: 42px;
  padding: 0 12px;
  border: 0;
  outline: 0;
  border-radius: var(--radius-control);
  color: var(--color-text);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
  font-size: 14px;
}

.clear-confirm__field input:focus {
  box-shadow: inset 0 0 0 1.5px var(--color-danger);
}

.clear-confirm__field input[aria-invalid="true"] {
  box-shadow: inset 0 0 0 1px var(--color-danger);
}

.clear-confirm__field input:disabled {
  color: var(--color-text-tertiary);
  background: var(--color-surface-soft);
}

.clear-confirm__error {
  margin: -8px 0 0;
  color: var(--color-danger);
  font-size: 11px;
  line-height: 16px;
}

.clear-confirm__actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
</style>
