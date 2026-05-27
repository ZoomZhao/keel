using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Windows;
using Microsoft.Web.WebView2.Core;

namespace Keel.WindowsShell;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        Loaded += OnLoaded;
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        var config = LoadHostConfig();
        var launcher = config.Windows.FirstOrDefault(window => window.Kind == "launcher")
            ?? config.Windows[0];

        Title = launcher.Title;
        Width = launcher.Size.Width;
        Height = launcher.Size.Height;
        MinWidth = launcher.Size.MinWidth ?? 520;
        MinHeight = launcher.Size.MinHeight ?? 360;
        ShowInTaskbar = !(launcher.HideFromTaskSwitcher ?? false);
        Topmost = launcher.AlwaysOnTop ?? false;

        await WebView.EnsureCoreWebView2Async();
        WebView.CoreWebView2.Navigate(config.Frontend.DevUrl + (launcher.Route ?? "/"));
    }

    private static HostConfig LoadHostConfig()
    {
        var currentDirectory = AppContext.BaseDirectory;
        var configPath = Path.GetFullPath(Path.Combine(
            currentDirectory,
            "../../../../../desktop-host/webview.config.json"
        ));

        var json = File.ReadAllText(configPath);
        return JsonSerializer.Deserialize<HostConfig>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        }) ?? throw new InvalidOperationException("Failed to parse host config.");
    }
}

public sealed record HostConfig(
    string Name,
    FrontendConfig Frontend,
    List<WindowConfig> Windows,
    PlatformConfig? Platform
);

public sealed record FrontendConfig(string DevUrl, string DistDir);

public sealed record WindowConfig(
    string Id,
    string Title,
    string Kind,
    string? Route,
    WindowSize Size,
    bool? Transparent,
    bool? AlwaysOnTop,
    bool? HideFromTaskSwitcher
);

public sealed record WindowSize(int Width, int Height, int? MinWidth, int? MinHeight);

public sealed record PlatformConfig(
    [property: JsonPropertyName("windows")] WindowsPlatformConfig? Windows
);

public sealed record WindowsPlatformConfig(WebView2Config? WebView2, WindowPlatformConfig? Window);

public sealed record WebView2Config(bool? TransparentBackground, string[]? AdditionalBrowserArguments);

public sealed record WindowPlatformConfig(bool? CustomChrome, bool? AcrylicBackdrop, bool? ShowInTaskbar);

