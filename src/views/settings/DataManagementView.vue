<script setup lang="ts">
import { showFailToast, showLoadingToast, showSuccessToast } from 'vant'
import { ref } from 'vue'

import exportJsonIcon from '@/assets/ui/settings/ic_export_json.svg?url'
import exportMarkdownIcon from '@/assets/ui/settings/ic_export_markdown.svg?url'
import AppAssetIcon from '@/components/base/AppAssetIcon.vue'
import AppCard from '@/components/base/AppCard.vue'
import AppIcon from '@/components/base/AppIcon.vue'
import AppPage from '@/components/base/AppPage.vue'
import SubpageHeader from '@/components/base/SubpageHeader.vue'
import { confirmAction } from '@/components/base/confirmAction'
import {
  createExportBundle,
  exportFilename,
  importPlansFromJson,
  parsePlanImport,
  saveTextFile,
  serializeJsonExport,
  serializeMarkdownExport,
} from '@/services/export/exportData'

const exporting = ref<'markdown' | 'json'>()
const importing = ref(false)
const fileInput = ref<HTMLInputElement>()

async function exportData(type: 'markdown' | 'json'): Promise<void> {
  exporting.value = type
  const toast = showLoadingToast({ message: '正在生成文件…', forbidClick: true, duration: 0 })
  try {
    const bundle = await createExportBundle()
    const markdown = type === 'markdown'
    const filename = exportFilename(markdown ? 'md' : 'json')
    const result = await saveTextFile(
      filename,
      markdown ? serializeMarkdownExport(bundle) : serializeJsonExport(bundle),
      markdown ? 'text/markdown;charset=utf-8' : 'application/json;charset=utf-8',
    )
    showSuccessToast(`已生成 ${result.filename}`)
  } catch (reason) {
    showFailToast(reason instanceof Error ? reason.message : String(reason))
  } finally {
    exporting.value = undefined
    toast.close()
  }
}

async function importFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  importing.value = true
  try {
    const content = await file.text()
    const preview = parsePlanImport(content)
    await confirmAction({
      title: '导入方案备份？',
      message: `文件可恢复 ${preview.plans.length} 个方案、${preview.tags.length} 个标签、${preview.matches.length} 场比赛和 ${preview.results.length} 条最新赛果。同 ID 方案会被覆盖；本地更新的比赛和赛果会保留，账单不会导入。`,
      confirmText: '确认导入',
    })
    const result = await importPlansFromJson(content)
    showSuccessToast(`已导入 ${result.plans} 个方案、${result.matches} 场比赛、${result.results} 条赛果`)
  } catch (reason) {
    if (reason === 'cancel' || reason === 'close') return
    showFailToast(reason instanceof Error ? reason.message : String(reason))
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <AppPage secondary content-class="data-content">
    <template #header><SubpageHeader title="数据与备份" subtitle="导出账单报告与完整结构化数据" /></template>
    <AppCard class="data-info">
      导出不会删除或修改本地数据。JSON 可恢复方案、标签及其比赛赛果，Markdown 适合阅读和归档。
    </AppCard>
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
            <small>比赛、方案与账单摘要，适合阅读和归档</small>
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
            <small>完整结构化数据，适合迁移和存档</small>
          </span>
          <van-loading v-if="exporting === 'json'" size="18" />
          <AppIcon v-else name="chevron-right" :size="18" />
        </button>
      </AppCard>
    </section>
    <section class="data-section">
      <h2>恢复</h2>
      <AppCard class="data-list" :padded="false">
        <button
          type="button"
          class="data-row"
          :disabled="importing"
          @click="fileInput?.click()"
        >
          <span class="data-row__icon data-row__icon--import">
            <AppIcon name="copy" :size="22" />
          </span>
          <span class="data-row__copy">
            <strong>从 JSON 恢复方案</strong>
            <small>恢复方案、标签及引用的比赛赛果；账单保持不变</small>
          </span>
          <van-loading v-if="importing" size="18" />
          <AppIcon v-else name="chevron-right" :size="18" />
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
  </AppPage>
</template>

<style scoped>
.data-content {
  align-content: start;
  gap: 12px;
}

.data-info {
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 16px;
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
</style>
