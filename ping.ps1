$headers = @{
    'apikey' = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3eGFxaG1nZWR5dWZxZ3B5enJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5ODcxMzUsImV4cCI6MjA4NjU2MzEzNX0.izJCnWSDfJNlVUot5Zuv5CvLrXocPQdwd4qRtK-0Fp8'
    'Authorization' = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3eGFxaG1nZWR5dWZxZ3B5enJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5ODcxMzUsImV4cCI6MjA4NjU2MzEzNX0.izJCnWSDfJNlVUot5Zuv5CvLrXocPQdwd4qRtK-0Fp8'
}
$uri = 'https://swxaqhmgedyufqgpyzrh.supabase.co/rest/v1/settings?select=key&limit=1'
try {
    $response = Invoke-RestMethod -Uri $uri -Headers $headers -Method Get
    Write-Host "✅ Ping successful!"
    Write-Host ($response | ConvertTo-Json)
} catch {
    Write-Error "❌ Ping failed: $($_.Exception.Message)"
    exit 1
}
