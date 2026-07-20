<script setup lang="ts">
import { showFailToast, showLoadingToast, showSuccessToast } from "vant";
import { computed, onMounted, ref } from "vue";

import exportJsonIcon from "@/assets/ui/settings/ic_export_json.svg?url";
import exportMarkdownIcon from "@/assets/ui/settings/ic_export_markdown.svg?url";
import AppAssetIcon from "@/components/base/AppAssetIcon.vue";
import AppBottomSheet from "@/components/base/AppBottomSheet.vue";
import AppButton from "@/components/base/AppButton.vue";
import AppCard from "@/components/base/AppCard.vue";
import AppIcon from "@/components/base/AppIcon.vue";
import AppPage from "@/components/base/AppPage.vue";
import SubpageHeader from "@/components/base/SubpageHeader.vue";
import { confirmAction } from "@/components/base/confirmAction";
import { getDatabase } from "@/services/database/createDatabase";
import {
  createExportBundle,
  exportFilename,
  importPlansFromJson,
  parsePlanImport,
  saveTextFile,
  serializeJsonExport,
  serializeMarkdownExport,
} from "@/services/export/exportData";
import type { DatabaseCounts } from "@/types/domain";

const exporting = ref<"markdown" | "json">();
const importing = ref(false);
const fileInput = ref<HTMLInputElement>();
const counts = ref<DatabaseCounts>();
const lastBackupAt = ref(localStorage.getItem("caiguo.lastBackupAt") || "");
const clearSheetVisible = ref(false);
const clearPhrase = ref("");
const clearing = ref(false);
const CLEAR_CONFIRMATION_PHRASE = "清空数据";
const clearPhraseMatches = computed(
  () => clearPhrase.value === CLEAR_CONFIRMATION_PHRASE,
);
const clearSummary = computed(() => {
  if (!counts.value) return "本机保存的全部业务数据";
  return `${counts.value.matches} 场比赛、${counts.value.plans} 个方案、${counts.value.ledgerOrders} 笔账单和 ${counts.value.tags} 个标签`;
});

onMounted(async () => {
  try {
    const database = getDatabase();
    await database.initialize();
    counts.value = await database.getCounts();
  } catch {
    counts.value = undefined;
  }
});

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
    const preview = parsePlanImport(content);
    await confirmAction({
      title: "导入方案备份？",
      message: `文件可恢复 ${preview.plans.length} 个方案、${preview.tags.length} 个标签、${preview.matches.length} 场比赛和 ${preview.results.length} 条最新赛果。同 ID 方案会被覆盖；本地更新的比赛和赛果会保留，账单不会导入。`,
      confirmText: "确认导入",
    });
    const result = await importPlansFromJson(content);
    showSuccessToast(
      `已导入 ${result.plans} 个方案、${result.matches} 场比赛、${result.results} 条赛果`,
    );
  } catch (reason) {
    if (reason === "cancel" || reason === "close") return;
    showFailToast(reason instanceof Error ? reason.message : String(reason));
  } finally {
    importing.value = false;
  }
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
    <template #header><SubpageHeader title="数据与备份" /></template>
    <section class="data-section">
      <h2>本机数据</h2>
      <AppCard class="data-list" :padded="false">
        <div class="data-row data-row--summary">
          <span class="data-row__icon">
            <AppIcon name="folder" :size="22" />
          </span>
          <span class="data-row__copy"><strong>比赛与方案</strong></span>
          <span class="data-row__value">
            {{ counts ? `${counts.matches}场 · ${counts.plans}个` : "读取中" }}
          </span>
        </div>
        <div class="data-row data-row--summary">
          <span class="data-row__icon data-row__icon--import">
            <AppIcon name="tag" :size="22" />
          </span>
          <span class="data-row__copy"><strong>账单与标签</strong></span>
          <span class="data-row__value">
            {{
              counts ? `${counts.ledgerOrders}笔 · ${counts.tags}个` : "读取中"
            }}
          </span>
        </div>
        <div class="data-row data-row--summary">
          <span class="data-row__icon data-row__icon--history">
            <AppIcon name="history" :size="22" />
          </span>
          <span class="data-row__copy"><strong>最后备份</strong></span>
          <span class="data-row__value">{{
            formatBackupTime(lastBackupAt)
          }}</span>
        </div>
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
          <AppIcon v-else name="chevron-right" :size="18" />
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
          <AppIcon v-else name="chevron-right" :size="18" />
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
          <template #icon><AppIcon name="save" :size="20" /></template>
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
          <AppIcon name="chevron-right" :size="18" />
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
              {{ clearSummary }}将永久删除；仅能通过此前导出的备份手动恢复部分数据。
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
  grid-template-columns: 36px minmax(0, 1fr) auto;
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
  grid-template-columns: 40px minmax(0, 1fr) 18px;
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
