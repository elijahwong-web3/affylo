<script setup lang="ts">
const auth = useAuth()
const password = ref('')
const error = ref('')
const loading = ref(false)

function onSubmit() {
  const p = password.value.trim()
  if (!p) {
    error.value = 'Please enter the password.'
    return
  }
  error.value = ''
  loading.value = true
  const ok = auth.checkPassword(p)
  loading.value = false
  if (!ok) {
    error.value = 'Incorrect password.'
    password.value = ''
  }
}
</script>

<template>
  <div class="password-gate">
    <div class="password-gate__card">
      <h1 class="password-gate__title">Affylo</h1>
      <p class="password-gate__subtitle">Enter the password to continue</p>
      <form class="password-gate__form" @submit.prevent="onSubmit">
        <input
          v-model="password"
          type="password"
          class="password-gate__input"
          placeholder="Password"
          autocomplete="current-password"
          autofocus
          :disabled="loading"
          @keydown.enter="onSubmit"
        />
        <p v-if="error" class="password-gate__error">{{ error }}</p>
        <button
          type="submit"
          class="password-gate__submit"
          :disabled="loading"
        >
          {{ loading ? 'Checking…' : 'Continue' }}
        </button>
      </form>
    </div>
  </div>
</template>
