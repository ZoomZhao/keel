using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using Microsoft.Web.WebView2.Core;

namespace Keel.WindowsShell;

public partial class MainWindow : Window
{
    private const int WmHotkey = 0x0312;
    private const uint ModAlt = 0x0001;
    private const uint ModControl = 0x0002;
    private const uint ModShift = 0x0004;
    private const uint ModWin = 0x0008;
    private const double OverlayCornerRadius = 10;
    private const double OverlayAnchorOffset = 10;
    private const double PopoverMinWidth = 160;
    private const double PopoverMaxWidth = 320;
    private const double PopoverMinHeight = 48;
    private const double PopoverMaxHeight = 180;
    private const double TooltipMinWidth = 72;
    private const double TooltipMaxWidth = 240;
    private const double TooltipMinHeight = 34;
    private const double TooltipMaxHeight = 72;
    private const double ToastMinWidth = 180;
    private const double ToastMaxWidth = 320;
    private const double ToastMinHeight = 48;
    private const double ToastMaxHeight = 140;
    private const double ToastScreenVerticalRatio = 0.72;

    private readonly Dictionary<int, HotkeyRegistration> _hotkeys = new();
    private readonly Dictionary<string, int> _hotkeyIdsByLogicalId = new();
    private int _nextHotkeyId = 1;
    private HostConfig? _config;
    private WindowConfig? _launcher;
    private HwndSource? _source;
    private Popup? _popover;
    private Popup? _tooltip;
    private Popup? _toast;

    public MainWindow()
    {
        InitializeComponent();
        Loaded += OnLoaded;
        PreviewKeyDown += OnPreviewKeyDown;
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        var config = LoadHostConfig();
        _config = config;
        _launcher = config.Windows.FirstOrDefault(window => window.Kind == "launcher")
            ?? config.Windows[0];

        Title = _launcher.Title;
        Width = _launcher.Size.Width;
        Height = _launcher.Size.Height;
        MinWidth = _launcher.Size.MinWidth ?? 520;
        MinHeight = _launcher.Size.MinHeight ?? 360;
        ShowInTaskbar = !(config.Platform?.Windows?.Window?.ShowInTaskbar == false || _launcher.HideFromTaskSwitcher == true);
        Topmost = _launcher.AlwaysOnTop ?? false;

        _source = HwndSource.FromHwnd(new WindowInteropHelper(this).Handle);
        _source?.AddHook(WndProc);

        var webView2Args = config.Platform?.Windows?.WebView2?.AdditionalBrowserArguments;
        var environmentOptions = new CoreWebView2EnvironmentOptions(
            webView2Args is { Length: > 0 } ? string.Join(" ", webView2Args) : null
        );
        var environment = await CoreWebView2Environment.CreateAsync(null, null, environmentOptions);

        await WebView.EnsureCoreWebView2Async(environment);
        WebView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
        WebView.CoreWebView2.Navigate(config.Frontend.DevUrl + (_launcher.Route ?? "/"));

        if (config.Platform?.Windows?.WebView2?.PrewarmBeforeShow == true)
        {
            Opacity = 0;
            Hide();
        }
    }

    protected override void OnClosing(CancelEventArgs e)
    {
        if (_launcher?.CloseBehavior == "hide")
        {
            e.Cancel = true;
            HideNativeOverlays();
            Hide();
            return;
        }

        HideNativeOverlays();
        base.OnClosing(e);
    }

    protected override void OnClosed(EventArgs e)
    {
        foreach (var id in _hotkeys.Keys.ToArray())
        {
            UnregisterHotKey(new WindowInteropHelper(this).Handle, id);
        }
        _hotkeyIdsByLogicalId.Clear();
        _source?.RemoveHook(WndProc);
        base.OnClosed(e);
    }

    private void OnPreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key != Key.Escape) return;
        HideNativeOverlays();
        Hide();
        e.Handled = true;
    }

    private void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        using var message = JsonDocument.Parse(e.WebMessageAsJson);
        if (!message.RootElement.TryGetProperty("method", out var methodElement)) return;

        var method = methodElement.GetString();
        var parameters = message.RootElement.TryGetProperty("params", out var paramsElement)
            ? paramsElement
            : default;

        HandleHostMessage(method, parameters);
    }

    private void HandleHostMessage(string? method, JsonElement parameters)
    {
        switch (method)
        {
            case "host.ready":
            case "window.show":
            case "window.focus":
                ShowLauncher();
                break;
            case "window.hide":
                HideNativeOverlays();
                Hide();
                break;
            case "toast.show":
                ShowToast(parameters);
                break;
            case "toast.hide":
                HidePopup(ref _toast);
                break;
            case "clipboard.writeText":
                var text = GetString(parameters, "text");
                if (text is not null) Clipboard.SetText(text);
                break;
            case "clipboard.readText":
                EmitNativeEvent("clipboard.readText.result", new { text = Clipboard.ContainsText() ? Clipboard.GetText() : string.Empty });
                break;
            case "globalHotkey.register":
                RegisterGlobalHotkey(parameters);
                break;
            case "popover.show":
                if (_config?.Platform?.Windows?.Window?.NativePopovers != false) ShowPopover(parameters);
                break;
            case "popover.hide":
                HidePopup(ref _popover);
                break;
            case "tooltip.show":
                if (_config?.Platform?.Windows?.Window?.NativeTooltips != false) ShowTooltip(parameters);
                break;
            case "tooltip.hide":
                HidePopup(ref _tooltip);
                break;
            default:
                Console.WriteLine($"[Keel bridge] Unsupported method: {method}");
                break;
        }
    }

    private void ShowLauncher()
    {
        Opacity = 1;
        Show();
        Activate();
        Topmost = _launcher?.AlwaysOnTop ?? Topmost;
    }

    private void HideNativeOverlays()
    {
        HidePopup(ref _popover);
        HidePopup(ref _tooltip);
        HidePopup(ref _toast);
    }

    private void RegisterGlobalHotkey(JsonElement parameters)
    {
        var id = GetString(parameters, "id");
        var accelerator = GetString(parameters, "accelerator");
        if (id is null || accelerator is null || !TryParseHotkey(id, accelerator, GetString(parameters, "action"), out var registration))
        {
            Console.WriteLine("[Keel hotkey] Invalid registration.");
            return;
        }

        if (_hotkeyIdsByLogicalId.TryGetValue(id, out var existingId))
        {
            if (_hotkeys.TryGetValue(existingId, out var existing) && existing == registration)
            {
                return;
            }

            UnregisterHotKey(new WindowInteropHelper(this).Handle, existingId);
            _hotkeys.Remove(existingId);
            _hotkeyIdsByLogicalId.Remove(id);
        }

        var nativeId = _nextHotkeyId++;
        var hwnd = new WindowInteropHelper(this).Handle;
        if (RegisterHotKey(hwnd, nativeId, registration.Modifiers, registration.VirtualKey))
        {
            _hotkeys[nativeId] = registration;
            _hotkeyIdsByLogicalId[id] = nativeId;
            Console.WriteLine($"[Keel hotkey] Registered {accelerator}");
        }
    }

    private IntPtr WndProc(IntPtr hwnd, int message, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (message == WmHotkey && _hotkeys.TryGetValue(wParam.ToInt32(), out var hotkey))
        {
            if (hotkey.Action == "window.focus") ShowLauncher();
            EmitNativeEvent("globalHotkey.pressed", new
            {
                id = hotkey.Id,
                accelerator = hotkey.Accelerator
            });
            handled = true;
        }

        return IntPtr.Zero;
    }

    private void EmitNativeEvent(string method, object payload)
    {
        var body = JsonSerializer.Serialize(new
        {
            source = "keelHost",
            method,
            payload
        });
        WebView.CoreWebView2?.PostWebMessageAsJson(body);
    }

    private void ShowPopover(JsonElement parameters)
    {
        var title = GetString(parameters, "title") ?? "Keel";
        var message = GetString(parameters, "message") ?? string.Empty;
        _popover = ShowPopup(_popover, title, message, parameters, NativeOverlayKind.Popover);
    }

    private void ShowTooltip(JsonElement parameters)
    {
        var text = GetString(parameters, "text") ?? string.Empty;
        _tooltip = ShowPopup(_tooltip, text, string.Empty, parameters, NativeOverlayKind.Tooltip);
        var tooltip = _tooltip;
        _ = Dispatcher.InvokeAsync(async () =>
        {
            await Task.Delay(2000);
            if (ReferenceEquals(_tooltip, tooltip)) HidePopup(ref _tooltip);
        });
    }

    private void ShowToast(JsonElement parameters)
    {
        var title = GetString(parameters, "title") ?? "Keel";
        var message = GetString(parameters, "message") ?? string.Empty;
        _toast = ShowPopup(_toast, title, message, parameters, NativeOverlayKind.Toast);
        var toast = _toast;
        _ = Dispatcher.InvokeAsync(async () =>
        {
            await Task.Delay(3200);
            if (ReferenceEquals(_toast, toast)) HidePopup(ref _toast);
        });
    }

    private Popup ShowPopup(
        Popup? current,
        string title,
        string message,
        JsonElement parameters,
        NativeOverlayKind kind
    )
    {
        HidePopup(ref current);
        var isToast = kind == NativeOverlayKind.Toast;
        var child = BuildPopupContent(title, message, kind);
        var desiredSize = MeasureOverlay(child, kind);
        var workArea = SystemParameters.WorkArea;
        var popup = new Popup
        {
            AllowsTransparency = true,
            PlacementTarget = WebView,
            Placement = isToast ? PlacementMode.AbsolutePoint : PlacementMode.RelativePoint,
            HorizontalOffset = isToast
                ? workArea.Left + ((workArea.Width - desiredSize.Width) / 2)
                : GetAnchorNumber(parameters, "x"),
            VerticalOffset = isToast
                ? workArea.Top + (workArea.Height * ToastScreenVerticalRatio) - (desiredSize.Height / 2)
                : GetAnchorNumber(parameters, "y") + GetAnchorNumber(parameters, "height") + OverlayAnchorOffset,
            Child = child,
            IsOpen = true
        };
        return popup;
    }

    private static Border BuildPopupContent(string title, string message, NativeOverlayKind kind)
    {
        var isTooltip = kind == NativeOverlayKind.Tooltip;
        var minWidth = MinWidthFor(kind);
        var maxWidth = MaxWidthFor(kind);
        var minHeight = MinHeightFor(kind);
        var maxHeight = MaxHeightFor(kind);
        var horizontalInset = isTooltip ? 12 : 14;
        var verticalInset = isTooltip ? 9 : 12;
        var contentMaxWidth = maxWidth - (horizontalInset * 2);
        var panel = new StackPanel
        {
            Margin = new Thickness(horizontalInset, verticalInset, horizontalInset, verticalInset)
        };
        panel.Children.Add(new TextBlock
        {
            Text = title,
            Foreground = new SolidColorBrush(Color.FromRgb(27, 35, 35)),
            FontSize = isTooltip ? 12 : 13,
            FontWeight = FontWeights.SemiBold,
            MaxWidth = contentMaxWidth,
            TextWrapping = TextWrapping.NoWrap,
            TextTrimming = TextTrimming.CharacterEllipsis
        });
        if (!string.IsNullOrEmpty(message))
        {
            panel.Children.Add(new TextBlock
            {
                Text = message,
                Foreground = new SolidColorBrush(Color.FromRgb(88, 99, 99)),
                FontSize = 12,
                Margin = new Thickness(0, 4, 0, 0),
                MaxWidth = contentMaxWidth,
                MaxHeight = (maxHeight - minHeight) + 24,
                TextWrapping = TextWrapping.Wrap,
                TextTrimming = TextTrimming.CharacterEllipsis
            });
        }

        return new Border
        {
            MinWidth = minWidth,
            MaxWidth = maxWidth,
            MinHeight = minHeight,
            MaxHeight = maxHeight,
            ClipToBounds = true,
            CornerRadius = new CornerRadius(OverlayCornerRadius),
            Background = new SolidColorBrush(Color.FromArgb(246, 247, 250, 250)),
            BorderBrush = Brushes.Transparent,
            BorderThickness = new Thickness(0),
            Effect = new System.Windows.Media.Effects.DropShadowEffect
            {
                BlurRadius = 24,
                ShadowDepth = 8,
                Color = Color.FromRgb(15, 23, 23),
                Opacity = 0.16
            },
            Child = panel
        };
    }

    private static Size MeasureOverlay(FrameworkElement element, NativeOverlayKind kind)
    {
        element.Measure(new Size(MaxWidthFor(kind), MaxHeightFor(kind)));
        return new Size(
            Math.Min(Math.Max(element.DesiredSize.Width, MinWidthFor(kind)), MaxWidthFor(kind)),
            Math.Min(Math.Max(element.DesiredSize.Height, MinHeightFor(kind)), MaxHeightFor(kind))
        );
    }

    private static double MinWidthFor(NativeOverlayKind kind) => kind switch
    {
        NativeOverlayKind.Tooltip => TooltipMinWidth,
        NativeOverlayKind.Toast => ToastMinWidth,
        _ => PopoverMinWidth
    };

    private static double MaxWidthFor(NativeOverlayKind kind) => kind switch
    {
        NativeOverlayKind.Tooltip => TooltipMaxWidth,
        NativeOverlayKind.Toast => ToastMaxWidth,
        _ => PopoverMaxWidth
    };

    private static double MinHeightFor(NativeOverlayKind kind) => kind switch
    {
        NativeOverlayKind.Tooltip => TooltipMinHeight,
        NativeOverlayKind.Toast => ToastMinHeight,
        _ => PopoverMinHeight
    };

    private static double MaxHeightFor(NativeOverlayKind kind) => kind switch
    {
        NativeOverlayKind.Tooltip => TooltipMaxHeight,
        NativeOverlayKind.Toast => ToastMaxHeight,
        _ => PopoverMaxHeight
    };

    private static void HidePopup(ref Popup? popup)
    {
        if (popup is not null) popup.IsOpen = false;
        popup = null;
    }

    private static double GetAnchorNumber(JsonElement parameters, string name)
    {
        if (parameters.ValueKind != JsonValueKind.Object ||
            !parameters.TryGetProperty("anchorRect", out var anchor) ||
            anchor.ValueKind != JsonValueKind.Object ||
            !anchor.TryGetProperty(name, out var property) ||
            !property.TryGetDouble(out var value))
        {
            return 0;
        }

        return value;
    }

    private static bool TryParseHotkey(string id, string accelerator, string? action, out HotkeyRegistration registration)
    {
        registration = default;
        var parts = accelerator.Split('+', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length == 0) return false;

        uint modifiers = 0;
        foreach (var modifier in parts[..^1])
        {
            modifiers |= modifier.ToLowerInvariant() switch
            {
                "cmd" or "command" or "meta" or "win" => ModWin,
                "shift" => ModShift,
                "option" or "alt" => ModAlt,
                "control" or "ctrl" => ModControl,
                _ => 0
            };
        }

        if (!Enum.TryParse<Key>(parts[^1], true, out var key)) return false;
        var virtualKey = (uint)KeyInterop.VirtualKeyFromKey(key);
        registration = new HotkeyRegistration(id, accelerator, action, modifiers, virtualKey);
        return virtualKey > 0;
    }

    private static string? GetString(JsonElement element, string propertyName)
    {
        return element.ValueKind == JsonValueKind.Object
            && element.TryGetProperty(propertyName, out var property)
            ? property.GetString()
            : null;
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

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnregisterHotKey(IntPtr hWnd, int id);
}

public readonly record struct HotkeyRegistration(
    string Id,
    string Accelerator,
    string? Action,
    uint Modifiers,
    uint VirtualKey
);

public enum NativeOverlayKind
{
    Popover,
    Tooltip,
    Toast
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
    bool? HideFromTaskSwitcher,
    string? CloseBehavior
);

public sealed record WindowSize(int Width, int Height, int? MinWidth, int? MinHeight);

public sealed record PlatformConfig(
    [property: JsonPropertyName("windows")] WindowsPlatformConfig? Windows
);

public sealed record WindowsPlatformConfig(WebView2Config? WebView2, WindowPlatformConfig? Window);

public sealed record WebView2Config(
    bool? TransparentBackground,
    string[]? AdditionalBrowserArguments,
    bool? PrewarmBeforeShow
);

public sealed record WindowPlatformConfig(
    bool? CustomChrome,
    bool? AcrylicBackdrop,
    bool? ShowInTaskbar,
    bool? NativeTooltips,
    bool? NativePopovers
);
