<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: string
    label?: string
    placeholder?: string
    maxLength?: number
    multiline?: boolean
    loading?: boolean
    error?: string
    allowEmpty?: boolean
  }>(),
  {
    label: '',
    placeholder: '',
    maxLength: 120,
    multiline: false,
    loading: false,
    error: '',
    allowEmpty: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  save: []
  cancel: []
}>()
</script>

<template>
  <div :class="['app-inline-editor', { 'app-inline-editor--multiline': multiline }]">
    <label v-if="label">{{ label }}</label>
    <textarea
      v-if="multiline"
      :value="modelValue"
      :maxlength="maxLength"
      rows="3"
      :placeholder="placeholder"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
    <input
      v-else
      :value="modelValue"
      :maxlength="maxLength"
      :placeholder="placeholder"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @keydown.enter.prevent="emit('save')"
      @keydown.escape.prevent="emit('cancel')"
    />
    <small v-if="error" class="app-inline-editor__error">{{ error }}</small>
    <div class="app-inline-editor__actions">
      <button type="button" @click="emit('cancel')">取消</button>
      <button type="button" :disabled="loading || (!allowEmpty && !modelValue.trim())" @click="emit('save')">
        {{ loading ? '保存中…' : '保存' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.app-inline-editor {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  padding: 8px;
  border-radius: var(--radius-control);
  background: var(--color-surface);
  box-shadow: var(--outline-primary);
}

.app-inline-editor label,
.app-inline-editor__error {
  grid-column: 1 / -1;
}

.app-inline-editor label {
  color: var(--color-text-secondary);
  font-size: 11px;
}

.app-inline-editor input,
.app-inline-editor textarea {
  width: 100%;
  min-width: 0;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-xs);
  outline: 0;
  color: var(--color-text);
  background: var(--color-surface-soft);
  box-shadow: var(--outline-default);
  font: inherit;
}

.app-inline-editor input {
  height: 38px;
}

.app-inline-editor textarea {
  min-height: 78px;
  padding-block: 9px;
  line-height: 1.5;
  resize: none;
}

.app-inline-editor input:focus,
.app-inline-editor textarea:focus {
  box-shadow: var(--outline-primary);
}

.app-inline-editor--multiline {
  grid-template-columns: 1fr;
}

.app-inline-editor__error {
  color: var(--color-danger);
  font-size: 11px;
}

.app-inline-editor__actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.app-inline-editor__actions button {
  min-width: 52px;
  min-height: 38px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-xs);
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.app-inline-editor__actions button:last-child {
  color: #fff;
  background: var(--color-primary);
}

.app-inline-editor__actions button:disabled {
  color: var(--color-text-tertiary);
  background: var(--color-disabled);
}
</style>
