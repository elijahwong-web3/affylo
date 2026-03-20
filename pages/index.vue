<script setup lang="ts">
const auth = useAuth()
const state = useChartState()
const chartLoading = computed(() => state.chartLoading.value)

const showChart = computed(
  () => auth.authReady.value && (auth.authenticated.value || !auth.passwordRequired.value)
)
const showGate = computed(
  () => auth.authReady.value && auth.passwordRequired.value && !auth.authenticated.value
)

async function initChart() {
  state.resetInteractionState()
  await state.loadFromFirebase()
}

watch(
  showChart,
  (v) => {
    if (v) void initChart()
  },
  { immediate: true }
)
</script>

<template>
  <div>
    <!-- Before auth is ready, show gate card with loading so we never flash "Loading chart..." -->
    <div v-if="!auth.authReady" class="password-gate">
      <div class="password-gate__card">
        <h1 class="password-gate__title">Group Chart</h1>
        <p class="password-gate__subtitle">Checking access…</p>
      </div>
    </div>
    <PasswordGate v-else-if="showGate" />
    <template v-else-if="showChart">
      <ChartToolbar />
      <div v-if="chartLoading" class="chart-loading">
        Loading chart…
      </div>
      <div v-else class="workspace-layout">
        <ChartSidebar />
        <ChartCanvas />
      </div>
      <ModalCard />
      <ModalLink />
    </template>
  </div>
</template>
