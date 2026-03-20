<script setup lang="ts">
import type { PortableChartData } from '~/composables/useChartState'

const state = useChartState()

function sanitizeFilePart(name: string) {
  return name.replace(/[^\w\- ]+/g, '').trim() || 'chart'
}

function exportJsonFromMenu() {
  try {
    const data = state.exportCurrentChartAsPortableJson()
    const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${sanitizeFilePart(data.name || 'chart')}.affylo.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(a.href)
  } catch (e) {
    window.alert(e instanceof Error ? `Export failed: ${e.message}` : 'Export failed.')
  }
}

function importJsonFromMenu() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,.affylo.json,application/json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()) as PortableChartData
      await state.importPortableChartJson(parsed)
    } catch (e) {
      window.alert(e instanceof Error ? `Import failed: ${e.message}` : 'Import failed: invalid JSON file.')
    }
  }
  input.click()
}

function onMenuAction(ev: Event) {
  const custom = ev as CustomEvent<string>
  if (custom.detail === 'export-json') {
    exportJsonFromMenu()
  } else if (custom.detail === 'import-json') {
    importJsonFromMenu()
  }
}

onMounted(() => {
  window.addEventListener('affylo-menu-action', onMenuAction as EventListener)
})

onBeforeUnmount(() => {
  window.removeEventListener('affylo-menu-action', onMenuAction as EventListener)
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
