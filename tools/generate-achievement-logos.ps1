param(
    [string]$SourcePath = "assets/branding/terrorsocke-logo.png",
    [string]$OutputDirectory = "assets/achievements"
)

Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;

public static class AchievementLogoColorizerV2
{
    public static Bitmap Recolor(Image source, Color dark, Color mid, Color light)
    {
        var result = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb);
        using (var graphics = Graphics.FromImage(result))
        {
            graphics.DrawImage(source, 0, 0, source.Width, source.Height);
        }

        for (var y = 0; y < result.Height; y++)
        {
            for (var x = 0; x < result.Width; x++)
            {
                var original = result.GetPixel(x, y);
                var red = original.R;
                var green = original.G;
                var blue = original.B;
                var max = Math.Max(red, Math.Max(green, blue));
                var min = Math.Min(red, Math.Min(green, blue));
                var saturation = max == 0 ? 0d : (max - min) / (double)max;
                var purpleOrPink = (red > green * 1.12 && blue > green * 1.08)
                    || (red > green * 1.35 && red > blue * 0.82);

                // Preserve black outlines, white highlights, eyes, teeth, and other neutral details.
                if (!purpleOrPink || max < 18 || min > 225 || (saturation < 0.08 && max > 55))
                {
                    continue;
                }

                var luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255d;
                var color = luminance < 0.52
                    ? Blend(dark, mid, luminance / 0.52)
                    : Blend(mid, light, (luminance - 0.52) / 0.48);
                result.SetPixel(x, y, Color.FromArgb(original.A, color.R, color.G, color.B));
            }
        }

        return result;
    }

    private static Color Blend(Color start, Color end, double amount)
    {
        amount = Math.Max(0d, Math.Min(1d, amount));
        return Color.FromArgb(
            255,
            (int)Math.Round(start.R + (end.R - start.R) * amount),
            (int)Math.Round(start.G + (end.G - start.G) * amount),
            (int)Math.Round(start.B + (end.B - start.B) * amount)
        );
    }
}
'@

$resolvedSource = (Resolve-Path $SourcePath).Path
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

$medals = @(
    @{ Name = "bronze"; Dark = "#6E351D"; Mid = "#B96A3D"; Light = "#F0B080"; Accent = "#8A4527" },
    @{ Name = "silver"; Dark = "#596270"; Mid = "#AAB4C2"; Light = "#F4F7FB"; Accent = "#778392" },
    @{ Name = "gold"; Dark = "#8A5A00"; Mid = "#E2A900"; Light = "#FFF0A6"; Accent = "#B97800" }
)

function New-Badge {
    param(
        [System.Drawing.Image]$Source,
        [hashtable]$Medal,
        [int]$Size,
        [string]$Path
    )

    $bitmap = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $margin = [Math]::Round($Size * 0.035)
    $shadowOffset = [Math]::Round($Size * 0.018)
    $outerRect = New-Object System.Drawing.RectangleF $margin, $margin, ($Size - 2 * $margin), ($Size - 2 * $margin)
    $shadowRect = New-Object System.Drawing.RectangleF ($outerRect.X + $shadowOffset), ($outerRect.Y + $shadowOffset), $outerRect.Width, $outerRect.Height

    $shadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(110, 0, 0, 0))
    $graphics.FillEllipse($shadowBrush, $shadowRect)

    $outerBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $outerRect,
        [System.Drawing.ColorTranslator]::FromHtml($Medal.Light),
        [System.Drawing.ColorTranslator]::FromHtml($Medal.Dark),
        45
    )
    $graphics.FillEllipse($outerBrush, $outerRect)

    $ringInset = [Math]::Round($Size * 0.048)
    $ringRect = New-Object System.Drawing.RectangleF ($outerRect.X + $ringInset), ($outerRect.Y + $ringInset), ($outerRect.Width - 2 * $ringInset), ($outerRect.Height - 2 * $ringInset)
    $ringBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $ringRect,
        [System.Drawing.ColorTranslator]::FromHtml($Medal.Dark),
        [System.Drawing.ColorTranslator]::FromHtml($Medal.Mid),
        225
    )
    $graphics.FillEllipse($ringBrush, $ringRect)

    $imageInset = [Math]::Round($Size * 0.083)
    $imageRect = New-Object System.Drawing.RectangleF ($outerRect.X + $imageInset), ($outerRect.Y + $imageInset), ($outerRect.Width - 2 * $imageInset), ($outerRect.Height - 2 * $imageInset)
    $clipPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $clipPath.AddEllipse($imageRect)
    $previousClip = $graphics.Clip
    $graphics.SetClip($clipPath)
    $graphics.DrawImage($Source, $imageRect)
    $graphics.Clip = $previousClip

    $innerPen = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml($Medal.Light)), ([Math]::Max(2, [Math]::Round($Size * 0.012)))
    $graphics.DrawEllipse($innerPen, $imageRect)

    $shinePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(180, 255, 255, 255)), ([Math]::Max(2, [Math]::Round($Size * 0.016)))
    $shineRect = New-Object System.Drawing.RectangleF ($outerRect.X + $ringInset / 2), ($outerRect.Y + $ringInset / 2), ($outerRect.Width - $ringInset), ($outerRect.Height - $ringInset)
    $graphics.DrawArc($shinePen, $shineRect, 205, 115)

    $medalRadius = [Math]::Round($Size * 0.105)
    $medalCenterX = [Math]::Round($Size * 0.80)
    $medalCenterY = [Math]::Round($Size * 0.80)
    $medalRect = New-Object System.Drawing.RectangleF ($medalCenterX - $medalRadius), ($medalCenterY - $medalRadius), (2 * $medalRadius), (2 * $medalRadius)
    $medalBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $medalRect,
        [System.Drawing.ColorTranslator]::FromHtml($Medal.Light),
        [System.Drawing.ColorTranslator]::FromHtml($Medal.Accent),
        60
    )
    $graphics.FillEllipse($medalBrush, $medalRect)
    $medalPen = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml($Medal.Dark)), ([Math]::Max(2, [Math]::Round($Size * 0.012)))
    $graphics.DrawEllipse($medalPen, $medalRect)

    $starPoints = New-Object 'System.Collections.Generic.List[System.Drawing.PointF]'
    for ($index = 0; $index -lt 10; $index++) {
        $angle = (-90 + $index * 36) * [Math]::PI / 180
        $radius = if ($index % 2 -eq 0) { $medalRadius * 0.55 } else { $medalRadius * 0.25 }
        $starPoints.Add((New-Object System.Drawing.PointF ($medalCenterX + [Math]::Cos($angle) * $radius), ($medalCenterY + [Math]::Sin($angle) * $radius)))
    }
    $starBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(225, 255, 255, 255))
    $graphics.FillPolygon($starBrush, $starPoints.ToArray())

    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)

    $starBrush.Dispose()
    $medalPen.Dispose()
    $medalBrush.Dispose()
    $shinePen.Dispose()
    $innerPen.Dispose()
    $clipPath.Dispose()
    $ringBrush.Dispose()
    $outerBrush.Dispose()
    $shadowBrush.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}

$source = [System.Drawing.Image]::FromFile($resolvedSource)
try {
    foreach ($medal in $medals) {
        New-Badge -Source $source -Medal $medal -Size 1024 -Path (Join-Path $OutputDirectory "logo-$($medal.Name).png")
        New-Badge -Source $source -Medal $medal -Size 256 -Path (Join-Path $OutputDirectory "logo-$($medal.Name)-256.png")

        $recolored = [AchievementLogoColorizerV2]::Recolor(
            $source,
            [System.Drawing.ColorTranslator]::FromHtml($medal.Dark),
            [System.Drawing.ColorTranslator]::FromHtml($medal.Mid),
            [System.Drawing.ColorTranslator]::FromHtml($medal.Light)
        )
        try {
            New-Badge -Source $recolored -Medal $medal -Size 1024 -Path (Join-Path $OutputDirectory "logo-full-$($medal.Name).png")
            New-Badge -Source $recolored -Medal $medal -Size 256 -Path (Join-Path $OutputDirectory "logo-full-$($medal.Name)-256.png")
        } finally {
            $recolored.Dispose()
        }
    }
} finally {
    $source.Dispose()
}