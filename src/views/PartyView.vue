<template>
  <main class="zt-page">
    <h1 style="font-size: 2.4rem">Quest parties</h1>
    <p class="text-muted">Join other travellers on the same mission today. Coming in Phase 8.</p>
    <div class="zt-card p-4">
      <ul class="small mb-3">
        <li>Hosts publish a mission as a public party with a start time and capacity.</li>
        <li>Solo travellers request to join; the host approves.</li>
        <li>Approved members get a realtime chat (Supabase Realtime on <code>messages</code>).</li>
        <li>If an advisory hits the party's area, members get a cancel recommendation.</li>
      </ul>
      <p class="tiny text-muted mb-0">The <code>parties</code>, <code>party_members</code> and <code>messages</code> tables and their RLS policies already exist in <code>supabase/schema.sql</code>.</p>
    </div>
  </main>
</template>
