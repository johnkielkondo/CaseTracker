using Microsoft.Extensions.FileProviders;
using Yarp.ReverseProxy.Configuration;

var builder = WebApplication.CreateBuilder(args);
var apiBaseUrl = builder.Configuration["ApiBaseUrl"];
var proxyEnabled = !string.IsNullOrWhiteSpace(apiBaseUrl);
if (proxyEnabled)
{
    if (!Uri.TryCreate(apiBaseUrl, UriKind.Absolute, out var apiUri)
        || (apiUri.Scheme != "http" && apiUri.Scheme != "https")
        || apiUri.AbsolutePath != "/" || !string.IsNullOrEmpty(apiUri.Query)
        || !string.IsNullOrEmpty(apiUri.Fragment) || !string.IsNullOrEmpty(apiUri.UserInfo))
        throw new InvalidOperationException("ApiBaseUrl must be an HTTP(S) origin, e.g. http://172.31.20.50:3000");

    builder.Services.AddReverseProxy().LoadFromMemory(
        new[] { new RouteConfig { RouteId = "api", ClusterId = "api", Match = new RouteMatch { Path = "/api/{**path}" } } },
        new[] { new ClusterConfig {
            ClusterId = "api",
            HttpRequest = new Yarp.ReverseProxy.Forwarder.ForwarderRequestConfig { ActivityTimeout = TimeSpan.FromSeconds(15) },
            Destinations = new Dictionary<string, DestinationConfig> {
                ["api-instance"] = new() { Address = apiUri.AbsoluteUri }
            }
        } });
}
var app = builder.Build();
var sitePath = Path.Combine(AppContext.BaseDirectory, "dist");
if (!Directory.Exists(sitePath)) sitePath = Path.Combine(builder.Environment.ContentRootPath, "dist");
if (!Directory.Exists(sitePath)) throw new InvalidOperationException("Build the website first: npm install && npm run build");
var files = new PhysicalFileProvider(sitePath);
app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = files });
app.UseStaticFiles(new StaticFileOptions { FileProvider = files });
app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "casetracker-web" }));
if (proxyEnabled) app.MapReverseProxy();
else app.Map("/api/{**path}", () => Results.Json(new { error = "API is not configured. Set ApiBaseUrl on the web server." }, statusCode: 503));
app.Run();
