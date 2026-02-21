// AgenticMail Enterprise Dashboard -- .NET / C# Edition
//
// Modular multi-file structure using .NET 8+ Minimal APIs.
// No MVC, no Razor, no extra NuGet packages.
//
// Setup:
//   cd dotnet && dotnet run
//
// Environment variables:
//   AGENTICMAIL_URL  - API base URL (default: http://localhost:3000)
//   PORT             - Dashboard port (default: 5002)

using AgenticMailDashboard.Services;
using AgenticMailDashboard.Routes;

var builder = WebApplication.CreateBuilder(args);

// --- Services ---
builder.Services.AddDistributedMemoryCache();
builder.Services.AddSession(options =>
{
    options.IdleTimeout = TimeSpan.FromHours(24);
    options.Cookie.HttpOnly = true;
    options.Cookie.IsEssential = true;
});
builder.Services.AddHttpClient();

// Register ApiClient as a scoped service
var apiUrl = Environment.GetEnvironmentVariable("AGENTICMAIL_URL") ?? "http://localhost:3000";
builder.Services.AddSingleton(sp =>
    new ApiClient(sp.GetRequiredService<IHttpClientFactory>(), apiUrl));

var app = builder.Build();

// --- Middleware ---
app.UseSession();
app.UseStaticFiles(); // Serves wwwroot/styles.css

// Auth guard: redirect to /login if no token (except for login page and static files)
app.Use(async (ctx, next) =>
{
    var path = ctx.Request.Path.Value ?? "";
    if (path != "/login" &&
        !path.StartsWith("/login") &&
        !path.StartsWith("/styles") &&
        !path.StartsWith("/.") &&
        ctx.Session.GetString("token") == null)
    {
        ctx.Response.Redirect("/login");
        return;
    }
    await next();
});

// --- Route Groups ---
AuthRoutes.Map(app);
DashboardRoutes.Map(app);
AgentRoutes.Map(app);
UserRoutes.Map(app);
ApiKeyRoutes.Map(app);
AuditRoutes.Map(app);
DlpRoutes.Map(app);
ComplianceRoutes.Map(app);
MessageRoutes.Map(app);
GuardrailRoutes.Map(app);
JournalRoutes.Map(app);
SettingRoutes.Map(app);
VaultRoutes.Map(app);
SkillRoutes.Map(app);
ActivityRoutes.Map(app);
ApprovalRoutes.Map(app);
CommunitySkillRoutes.Map(app);
DomainStatusRoutes.Map(app);
KnowledgeRoutes.Map(app);
KnowledgeContributionRoutes.Map(app);
SkillConnectionRoutes.Map(app);
WorkforceRoutes.Map(app);

// --- Start ---
var port = Environment.GetEnvironmentVariable("PORT") ?? "5002";
app.Urls.Add($"http://localhost:{port}");

Console.WriteLine();
Console.WriteLine("AgenticMail Enterprise Dashboard (.NET)");
Console.WriteLine($"  API:       {apiUrl}");
Console.WriteLine($"  Dashboard: http://localhost:{port}");
Console.WriteLine();

app.Run();
