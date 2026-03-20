<script setup lang="ts">
const state = useChartState()
const newChartName = ref('')
const editingId = ref<string | null>(null)
const editingName = ref('')

const chartItems = computed(() => state.chartList.value)
const activeId = computed(() => state.activeChartId.value)
const sidebarOpen = computed(() => state.sidebarOpen.value)

function toggleSidebar() {
  state.sidebarOpen.value = !state.sidebarOpen.value
}

async function onCreateChart() {
  await state.createChart(newChartName.value)
  newChartName.value = ''
}

async function onSwitchChart(id: string) {
  if (editingId.value === id) return
  await state.switchChart(id)
}

function startRename(id: string, currentName: string) {
  editingId.value = id
  editingName.value = currentName
}

async function commitRename(id: string) {
  const trimmed = editingName.value.trim()
  editingId.value = null
  if (trimmed && trimmed !== chartItems.value.find((c) => c.id === id)?.name) {
    await state.renameChart(id, trimmed)
  }
  editingName.value = ''
}

function cancelRename() {
  editingId.value = null
  editingName.value = ''
}

async function onDeleteChart(id: string) {
  if (!confirm('Delete this chart? This cannot be undone.')) return
  await state.deleteChart(id)
}

</script>

<template>
  <aside class="chart-sidebar" :class="{ 'chart-sidebar--closed': !sidebarOpen }">
    <!-- Edge arrow toggle -->
    <button
      type="button"
      class="chart-sidebar__edge-toggle"
      :class="{ 'chart-sidebar__edge-toggle--closed': !sidebarOpen }"
      :title="sidebarOpen ? 'Hide sidebar' : 'Show sidebar'"
      @click="toggleSidebar"
    >
      <span class="chart-sidebar__arrow">{{ sidebarOpen ? '\u2039' : '\u203A' }}</span>
    </button>

    <template v-if="sidebarOpen">
      <div class="chart-sidebar__header">
        <h2>Charts</h2>
      </div>

      <div class="chart-sidebar__body">
        <div class="chart-sidebar__create">
          <input
            v-model.trim="newChartName"
            type="text"
            class="chart-sidebar__input"
            placeholder="New chart name"
            @keydown.enter="onCreateChart"
          >
          <button type="button" class="chart-sidebar__button" @click="onCreateChart">
            +
          </button>
        </div>
        <ul class="chart-sidebar__list">
          <li
            v-for="chart in chartItems"
            :key="chart.id"
            class="chart-sidebar__item"
            :class="{ active: activeId === chart.id }"
          >
            <!-- Inline rename: click name to edit -->
            <input
              v-if="editingId === chart.id"
              v-model.trim="editingName"
              type="text"
              class="chart-sidebar__inline-rename"
              autofocus
              @keydown.enter="commitRename(chart.id)"
              @keydown.escape="cancelRename"
              @blur="commitRename(chart.id)"
            >
            <button
              v-else
              type="button"
              class="chart-sidebar__item-name"
              @click="onSwitchChart(chart.id)"
              @dblclick.stop="startRename(chart.id, chart.name)"
            >
              {{ chart.name }}
            </button>

            <!-- Small cross delete button -->
            <button
              type="button"
              class="chart-sidebar__delete"
              title="Delete chart"
              @click.stop="onDeleteChart(chart.id)"
            >
              &times;
            </button>
          </li>
        </ul>
      </div>
    </template>
  </aside>
</template>
