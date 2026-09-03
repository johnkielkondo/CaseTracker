var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

var indexPath = Path.Combine(AppContext.BaseDirectory, "index.html");
app.MapGet("/", () => Results.File(indexPath, "text/html"));

app.Run();