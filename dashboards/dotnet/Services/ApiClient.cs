using System.Net.Http.Json;
using System.Text.Json;

namespace AgenticMailDashboard.Services;

/// <summary>
/// HttpClient wrapper for JSON API calls with Bearer token from session.
/// </summary>
public class ApiClient
{
    private readonly IHttpClientFactory _httpFactory;
    private readonly string _apiUrl;

    public ApiClient(IHttpClientFactory httpFactory, string apiUrl)
    {
        _httpFactory = httpFactory;
        _apiUrl = apiUrl;
    }

    private HttpClient CreateClient(HttpContext ctx)
    {
        var client = _httpFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(10);
        var token = ctx.Session.GetString("token");
        if (token != null)
            client.DefaultRequestHeaders.Add("Authorization", $"Bearer {token}");
        return client;
    }

    public async Task<JsonElement?> GetAsync(HttpContext ctx, string path)
    {
        try
        {
            var client = CreateClient(ctx);
            var resp = await client.GetAsync($"{_apiUrl}{path}");
            var json = await resp.Content.ReadAsStringAsync();
            return JsonDocument.Parse(json).RootElement;
        }
        catch { return null; }
    }

    public async Task<(JsonElement? Data, int StatusCode)> PostAsync(HttpContext ctx, string path, object? body = null)
    {
        try
        {
            var client = CreateClient(ctx);
            var resp = await client.PostAsJsonAsync($"{_apiUrl}{path}", body ?? new { });
            var json = await resp.Content.ReadAsStringAsync();
            return (JsonDocument.Parse(json).RootElement, (int)resp.StatusCode);
        }
        catch { return (null, 0); }
    }

    public async Task<(JsonElement? Data, int StatusCode)> PatchAsync(HttpContext ctx, string path, object? body = null)
    {
        try
        {
            var client = CreateClient(ctx);
            var resp = await client.PatchAsJsonAsync($"{_apiUrl}{path}", body ?? new { });
            var json = await resp.Content.ReadAsStringAsync();
            return (JsonDocument.Parse(json).RootElement, (int)resp.StatusCode);
        }
        catch { return (null, 0); }
    }

    public async Task<(JsonElement? Data, int StatusCode)> PutAsync(HttpContext ctx, string path, object? body = null)
    {
        try
        {
            var client = CreateClient(ctx);
            var resp = await client.PutAsJsonAsync($"{_apiUrl}{path}", body ?? new { });
            var json = await resp.Content.ReadAsStringAsync();
            return (JsonDocument.Parse(json).RootElement, (int)resp.StatusCode);
        }
        catch { return (null, 0); }
    }

    public async Task<(JsonElement? Data, int StatusCode)> DeleteAsync(HttpContext ctx, string path)
    {
        try
        {
            var client = CreateClient(ctx);
            var resp = await client.DeleteAsync($"{_apiUrl}{path}");
            var json = await resp.Content.ReadAsStringAsync();
            return (JsonDocument.Parse(json).RootElement, (int)resp.StatusCode);
        }
        catch { return (null, 0); }
    }

    // --- JSON helpers ---

    public static string Str(JsonElement? el, string prop)
        => el?.TryGetProperty(prop, out var v) == true ? v.ToString() : "";

    public static int Int(JsonElement? el, string prop)
        => el?.TryGetProperty(prop, out var v) == true && v.TryGetInt32(out var n) ? n : 0;

    public static string StrOr(JsonElement? el, string prop, string fallback)
    {
        var val = Str(el, prop);
        return string.IsNullOrEmpty(val) ? fallback : val;
    }
}
