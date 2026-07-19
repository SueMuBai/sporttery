<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import AppIcon from '@/components/base/AppIcon.vue'

type PickerMode = 'day' | 'year' | 'month'
type Endpoint = 'start' | 'end'

const props = withDefaults(
  defineProps<{
    start: string
    end: string
    minDate: Date
    maxDate: Date
    activeEndpoint?: Endpoint
    expanded?: boolean
  }>(),
  {
    activeEndpoint: undefined,
    expanded: true,
  },
)

const emit = defineEmits<{
  'update:start': [value: string]
  'update:end': [value: string]
  'update:activeEndpoint': [value: Endpoint]
  'update:expanded': [value: boolean]
}>()

function formatParts(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function fromDate(date: Date): string {
  return formatParts(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

function displayDate(value: string): string {
  if (!value) return '请选择'
  return props.expanded ? value.replaceAll('-', '/') : value
}

function parts(value: string): [number, number, number] {
  const [year, month, day] = value.split('-').map(Number)
  return [year || 0, month || 1, day || 1]
}

const initial = parts(props.start || fromDate(new Date()))
const mode = ref<PickerMode>('day')
const internalActive = ref<Endpoint>(props.start ? 'end' : 'start')
const active = computed<Endpoint>({
  get: () => props.activeEndpoint ?? internalActive.value,
  set: (value) => {
    internalActive.value = value
    emit('update:activeEndpoint', value)
  },
})
const visibleYear = ref(initial[0])
const visibleMonth = ref(initial[1])
const yearPageStart = ref(Math.floor(initial[0] / 12) * 12)

watch(
  () => props.start,
  (value) => {
    if (!value) return
    const [year, month] = parts(value)
    visibleYear.value = year
    visibleMonth.value = month
  },
)

watch(
  () => props.expanded,
  (expanded) => {
    if (!expanded) mode.value = 'day'
  },
)

function activateEndpoint(endpoint: Endpoint): void {
  active.value = endpoint
  emit('update:expanded', true)
}

const minimum = computed(() => fromDate(props.minDate))
const maximum = computed(() => fromDate(props.maxDate))
const monthDays = computed(() => new Date(visibleYear.value, visibleMonth.value, 0).getDate())
const firstWeekday = computed(() => new Date(visibleYear.value, visibleMonth.value - 1, 1).getDay())
const days = computed(() => Array.from({ length: monthDays.value }, (_, index) => index + 1))
const years = computed(() => Array.from({ length: 12 }, (_, index) => yearPageStart.value + index))
const months = Array.from({ length: 12 }, (_, index) => index + 1)

function dateValue(day: number): string {
  return formatParts(visibleYear.value, visibleMonth.value, day)
}

function disabled(value: string): boolean {
  return value < minimum.value || value > maximum.value
}

function selectDay(day: number): void {
  const value = dateValue(day)
  if (disabled(value)) return
  if (active.value === 'start') {
    emit('update:start', value)
    if (props.end && props.end < value) emit('update:end', '')
    active.value = 'end'
  } else {
    if (props.start && value < props.start) {
      emit('update:end', props.start)
      emit('update:start', value)
      return
    }
    emit('update:end', value)
  }
}

function chooseYear(year: number): void {
  visibleYear.value = year
  mode.value = 'month'
}

function openYearPicker(): void {
  mode.value = 'year'
  yearPageStart.value = Math.floor(visibleYear.value / 12) * 12
}

function chooseMonth(month: number): void {
  visibleMonth.value = month
  mode.value = 'day'
}

function monthBoundary(year: number, month: number, end = false): string {
  return formatParts(year, month, end ? new Date(year, month, 0).getDate() : 1)
}

function monthDisabled(year: number, month: number): boolean {
  return monthBoundary(year, month, true) < minimum.value || monthBoundary(year, month) > maximum.value
}

function yearDisabled(year: number): boolean {
  return monthBoundary(year, 12, true) < minimum.value || monthBoundary(year, 1) > maximum.value
}

function moveMonth(delta: number): void {
  const date = new Date(visibleYear.value, visibleMonth.value - 1 + delta, 1)
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  if (monthDisabled(year, month)) return
  visibleYear.value = year
  visibleMonth.value = month
}

function movePicker(delta: number): void {
  if (mode.value === 'year') yearPageStart.value += delta * 12
  else if (mode.value === 'month') visibleYear.value += delta
  else moveMonth(delta)
}

function selectedMonth(): boolean {
  const value = active.value === 'start' ? props.start : props.end
  if (!value) return false
  const [year, month] = parts(value)
  return year === visibleYear.value && month === visibleMonth.value
}
</script>

<template>
  <section :class="['date-range-picker', { 'date-range-picker--expanded': expanded }]" aria-label="日期范围选择器">
    <div class="date-range-picker__endpoints">
      <button
        type="button"
        :class="{ active: active === 'start' }"
        :aria-expanded="expanded && active === 'start'"
        @click="activateEndpoint('start')"
      >
        <strong class="numeric">{{ displayDate(start) }}</strong>
        <span>
          <AppIcon name="calendar" :size="18" />
          <AppIcon v-if="!expanded" name="chevron-down" :size="14" />
        </span>
      </button>
      <b>至</b>
      <button
        type="button"
        :class="{ active: active === 'end' }"
        :aria-expanded="expanded && active === 'end'"
        @click="activateEndpoint('end')"
      >
        <strong class="numeric">{{ displayDate(end) }}</strong>
        <span>
          <AppIcon name="calendar" :size="18" />
          <AppIcon v-if="!expanded" name="chevron-down" :size="14" />
        </span>
      </button>
    </div>

    <div v-if="expanded" class="date-range-picker__toolbar">
      <button type="button" aria-label="上一页" @click="movePicker(-1)">
        <AppIcon name="chevron-left" :size="20" />
      </button>
      <div>
        <button
          type="button"
          :class="{ active: mode === 'year' }"
          @click="openYearPicker"
        >
          {{ visibleYear }}年
        </button>
        <button type="button" :class="{ active: mode === 'month' }" @click="mode = 'month'">{{ visibleMonth }}月</button>
        <button type="button" :class="{ active: mode === 'day' }" @click="mode = 'day'">日期</button>
      </div>
      <button type="button" aria-label="下一页" @click="movePicker(1)">
        <AppIcon name="chevron-right" :size="20" />
      </button>
    </div>

    <div v-if="expanded && mode === 'day'" class="date-range-picker__calendar">
      <div class="date-range-picker__week">
        <span v-for="label in ['日', '一', '二', '三', '四', '五', '六']" :key="label">{{ label }}</span>
      </div>
      <div class="date-range-picker__days">
        <span v-for="(_, index) in firstWeekday" :key="`blank-${index}`" />
        <button
          v-for="day in days"
          :key="day"
          type="button"
          :disabled="disabled(dateValue(day))"
          :class="{
            'in-range': start && end && dateValue(day) > start && dateValue(day) < end,
            'is-start': dateValue(day) === start,
            'is-end': dateValue(day) === end,
          }"
          @click="selectDay(day)"
        >
          {{ day }}
        </button>
      </div>
    </div>

    <div v-else-if="expanded && mode === 'year'" class="date-range-picker__picker-grid">
      <button
        v-for="year in years"
        :key="year"
        type="button"
        :disabled="yearDisabled(year)"
        :class="{ selected: year === visibleYear }"
        @click="chooseYear(year)"
      >
        {{ year }}年
      </button>
    </div>

    <div v-else-if="expanded" class="date-range-picker__picker-grid">
      <button
        v-for="month in months"
        :key="month"
        type="button"
        :disabled="monthDisabled(visibleYear, month)"
        :class="{ selected: selectedMonth() && month === visibleMonth }"
        @click="chooseMonth(month)"
      >
        {{ month }}月
      </button>
    </div>

    <p v-if="expanded" class="date-range-picker__summary">
      已选择
      <strong class="numeric">{{ displayDate(start) }}</strong>
      至
      <strong class="numeric">{{ displayDate(end) }}</strong>
    </p>
  </section>
</template>

<style scoped>
.date-range-picker {
  display: grid;
  gap: 8px;
}

.date-range-picker__endpoints {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 6px;
}

.date-range-picker__endpoints > button {
  display: flex;
  min-width: 0;
  min-height: 40px;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 0 9px;
  border: 0;
  border-radius: var(--radius-control);
  color: var(--color-text);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
}

.date-range-picker--expanded .date-range-picker__endpoints > button.active {
  box-shadow: var(--outline-primary);
}

.date-range-picker__endpoints > b {
  font-size: 13px;
  font-weight: 500;
}

.date-range-picker__endpoints strong {
  overflow: hidden;
  font-size: 12px;
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.date-range-picker__endpoints button > span {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 3px;
  color: var(--color-text-secondary);
}

.date-range-picker__toolbar {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 32px;
  align-items: center;
  gap: 6px;
}

.date-range-picker__toolbar > button,
.date-range-picker__toolbar div button {
  min-width: 44px;
  min-height: 40px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius-xs);
  color: var(--color-text);
  background: transparent;
}

.date-range-picker__toolbar > button {
  display: grid;
  min-width: 32px;
  min-height: 40px;
  place-items: center;
  color: var(--color-primary);
}

.date-range-picker__toolbar div {
  display: grid;
  overflow: hidden;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-radius: var(--radius-control);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
}

.date-range-picker__toolbar div button {
  min-width: 0;
  border-radius: 0;
}

.date-range-picker__toolbar div button + button {
  border-left: 1px solid var(--color-divider);
}

.date-range-picker__toolbar div button.active {
  color: var(--color-primary);
  background: var(--color-primary-soft);
  box-shadow: none;
}

.date-range-picker__calendar {
  overflow: hidden;
  border-radius: var(--radius-control);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
}

.date-range-picker__week,
.date-range-picker__days {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  text-align: center;
}

.date-range-picker__week span {
  display: grid;
  min-height: 28px;
  place-items: center;
  color: var(--color-text-secondary);
  font-size: 10px;
}

.date-range-picker__days > span,
.date-range-picker__days button {
  min-width: 0;
  min-height: 40px;
}

.date-range-picker__days button {
  position: relative;
  border: 0;
  color: var(--color-text);
  background: transparent;
  font-size: 12px;
}

.date-range-picker__days button.in-range {
  background: var(--color-primary-soft);
}

.date-range-picker__days button.is-start,
.date-range-picker__days button.is-end {
  color: #fff;
  border-radius: 50%;
  background: var(--color-primary);
}

.date-range-picker__days button.is-end {
  background: var(--color-primary);
}

.date-range-picker__days button:disabled {
  color: var(--color-disabled);
}

.date-range-picker__picker-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.date-range-picker__picker-grid button {
  min-height: 48px;
  border: 0;
  border-radius: var(--radius-control);
  color: var(--color-text);
  background: var(--color-surface);
  box-shadow: var(--outline-default);
}

.date-range-picker__picker-grid button.selected {
  color: #fff;
  background: var(--color-primary);
  box-shadow: var(--outline-primary);
}

.date-range-picker__picker-grid button:disabled {
  color: var(--color-disabled);
  background: var(--color-surface-soft);
}

.date-range-picker__summary {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 12px;
  text-align: center;
}

.date-range-picker__summary strong {
  margin: 0 3px;
  color: var(--color-primary);
  font-weight: 500;
}
</style>
