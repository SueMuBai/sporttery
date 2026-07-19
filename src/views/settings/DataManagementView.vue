<script setup lang="ts">
import { showFailToast, showLoadingToast, showSuccessToast } from 'vant'
import { ref } from 'vue'

import exportJsonIcon from '@/assets/ui/settings/ic_export_json.svg?url'
import exportMarkdownIcon from '@/assets/ui/settings/ic_export_markdown.svg?url'
import AppAssetIcon from '@/components/base/AppAssetIcon.vue'
import AppButton from '@/components/base/AppButton.vue'
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
  <AppPage secondary>
    <template #header><SubpageHeader title="数据与备份" subtitle="导出账单报告与完整结构化数据" /></template>
    <AppCard class="data-info">
      导出不会删除或修改本地数据。JSON 可恢复方案、标签及其比赛赛果，Markdown 适合阅读和归档。
    </AppCard>
    <AppCard class="export-card">
      <span class="export-icon export-icon--markdown"><AppAssetIcon :src="exportMarkdownIcon" /></span>
      <div><h2>Markdown 报告</h2><p>包含账单汇总、方案和比赛选择，适合阅读。</p></div>
      <AppButton size="small" variant="secondary" :loading="exporting === 'markdown'" @click="exportData('markdown')">导出</AppButton>
    </AppCard>
    <AppCard class="export-card">
      <span class="export-icon export-icon--json"><AppAssetIcon :src="exportJsonIcon" /></span>
      <div><h2>JSON 完整备份</h2><p>保留可重新解析的结构化数据，适合迁移和存档。</p></div>
      <AppButton size="small" :loading="exporting === 'json'" @click="exportData('json')">导出</AppButton>
    </AppCard>
    <AppCard class="export-card">
      <span class="export-icon export-icon--import"><AppIcon name="copy" /></span>
      <div><h2>导入方案备份</h2><p>恢复方案、标签和引用的比赛赛果；账单保持不变。</p></div>
      <AppButton size="small" variant="secondary" :loading="importing" @click="fileInput?.click()">选择文件</AppButton>
      <input
        ref="fileInput"
        class="file-input"
        type="file"
        accept=".json,application/json"
        aria-label="选择彩果 JSON 备份"
        @change="importFile"
      />
    </AppCard>
  </AppPage>
</template>

<style scoped>
.data-info {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.55;
}

.export-card {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
}

.export-icon {
  display: grid;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-control);
  place-items: center;
  color: #ff8fb3;
  background: #fff0f6;
  font-size: 24px;
}

.export-icon--json {
  color: #e8aa32;
  background: #fff8df;
}

.export-icon--import {
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.export-card h2,
.export-card p {
  margin: 0;
}

.export-card h2 {
  font-size: 14px;
}

.export-card p {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1.45;
}
</style>
