<script setup lang="ts">
const state = useChartState()
const exportingPdf = ref(false)
const toolbarEl = ref<HTMLElement | null>(null)

function updateToolbarHeightVar() {
  const h = Math.ceil(toolbarEl.value?.getBoundingClientRect().height ?? 56)
  document.documentElement.style.setProperty('--toolbar-height', `${h}px`)
}

async function downloadExport() {
  if (exportingPdf.value) return
  exportingPdf.value = true
  try {
    await exportGroupChartToPdf()
  } finally {
    exportingPdf.value = false
  }
}

const searchQuery = computed({
  get: () => state.searchQuery.value,
  set: (v: string) => { state.searchQuery.value = v }
})

const chartLoadError = computed(() => state.chartLoadError.value)

function addCompany() {
  const card = state.addCard()
  state.editingCardId.value = card.id
  state.modalCardViewMode.value = false
  state.modalCardOpen.value = true
}

function toggleLinkMode() {
  state.deleteConnectionMode.value = false
  state.editingRelationshipId.value = null
  state.selectMode.value = false
  if (state.linkFromId.value !== null) {
    state.linkFromId.value = null
    state.linkHint.value = state.DEFAULT_HINT
  } else {
    state.linkHint.value = 'Click first company, then second company'
    state.linkFromId.value = 'waiting'
  }
}

function toggleDeleteConnectionMode() {
  state.linkFromId.value = null
  state.linkHint.value = state.DEFAULT_HINT
  state.editingRelationshipId.value = null
  state.selectMode.value = false
  state.deleteConnectionMode.value = !state.deleteConnectionMode.value
  if (state.deleteConnectionMode.value) {
    state.linkHint.value = 'Click a connection line to delete it'
  }
}

function toggleSelectMode() {
  state.linkFromId.value = null
  state.linkHint.value = state.DEFAULT_HINT
  state.deleteConnectionMode.value = false
  state.editingRelationshipId.value = null
  const wasActive = state.selectMode.value
  state.selectMode.value = !state.selectMode.value
  if (state.selectMode.value) {
    state.linkHint.value = 'Drag to select cards and connections'
  } else if (wasActive) {
    state.clearSelection()
  }
}

const isEditMode = computed(() => state.chartEditMode.value)
const activeChartName = computed(() => {
  const active = state.chartList.value.find((c) => c.id === state.activeChartId.value)
  return active?.name || 'Chart'
})

function toggleEditMode() {
  state.chartEditMode.value = !state.chartEditMode.value
}

let toolbarResizeObserver: ResizeObserver | null = null
onMounted(() => {
  updateToolbarHeightVar()
  window.addEventListener('resize', updateToolbarHeightVar)
  if (typeof ResizeObserver !== 'undefined' && toolbarEl.value) {
    toolbarResizeObserver = new ResizeObserver(() => updateToolbarHeightVar())
    toolbarResizeObserver.observe(toolbarEl.value)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateToolbarHeightVar)
  toolbarResizeObserver?.disconnect()
  toolbarResizeObserver = null
})

</script>

<template>
  <header ref="toolbarEl" class="toolbar" :class="{ 'toolbar--edit-mode': isEditMode }">
    <div class="toolbar-left">
      <h1>Affylo</h1>
      <span class="toolbar-current-chart" :title="activeChartName">
        {{ activeChartName }}
      </span>
      <div v-if="isEditMode" class="toolbar-actions">
        <button type="button" class="primary" @click="addCompany">
          Add company
        </button>
        <button
          type="button"
          :class="{ active: state.linkFromId !== null }"
          @click="toggleLinkMode"
        >
          Add connection
        </button>
        <button
          type="button"
          :class="{ active: state.deleteConnectionMode.value }"
          @click="toggleDeleteConnectionMode"
        >
          Delete connection
        </button>
        <button
          type="button"
          :class="{ active: state.selectMode.value }"
          @click="toggleSelectMode"
        >
          Select
        </button>
      </div>
    </div>
    <span v-if="isEditMode" class="hint">{{ state.linkHint }}</span>
    <span class="toolbar-spacer" />
    <div class="toolbar-right">
      <input
        v-if="!isEditMode"
        v-model.trim="searchQuery"
        type="text"
        class="toolbar-search"
        placeholder="Search"
        aria-label="Search"
      >
      <span v-if="chartLoadError && !isEditMode" class="toolbar-error" :title="chartLoadError">
        Load failed
      </span>
      <button
        type="button"
        class="toolbar-export-pdf"
        :disabled="exportingPdf"
        :title="exportingPdf ? 'Preparing PDF…' : 'Export current chart as PDF'"
        @click="downloadExport"
      >
        {{ exportingPdf ? 'Exporting…' : 'Export PDF' }}
      </button>
      <button
        type="button"
        class="edit-toggle"
        :class="{ active: isEditMode }"
        @click="toggleEditMode"
      >
        {{ isEditMode ? 'Done' : 'Edit' }}
      </button>
    </div>
  </header>
</template>
