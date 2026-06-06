# scripts/session-end.ps1
#
# Session-end helper for Cline / Claude / other agentic chats.
# Dot-source this file to expose Add-SessionSummary, which appends a
# draft issue to GitHub Project #3 summarizing what this session did
# and what the next session should pick up.
#
# Usage (from a Cline prompt or terminal):
#
#   . .\scripts\session-end.ps1
#   Add-SessionSummary `
#     -Title "Map tools: A* on Pointy-Top maps" `
#     -Summary "Wrote src/lib/mapTools.ts (axial distance, A*, link helpers) and 25 unit tests. All green." `
#     -Todos "Add Claude tool wrappers in src/lib/claude.ts (Phase 1c)", "Build /maps UI link-to-lore modal (Phase 1d)" `
#     -FilesTouched "src/lib/mapTools.ts", "src/lib/__tests__/mapTools.test.ts" `
#     -Doc "docs/future/claude-map-tools.md"
#
# Or one-liner:
#
#   . .\scripts\session-end.ps1
#   Add-SessionSummary -Title "Foo" -Summary "Bar" -Todos "Task 1","Task 2"
#
# Requires: gh CLI on PATH with the `project` scope
#   (one-time: gh auth refresh -s project)

function Add-SessionSummary {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string] $Title,
        [Parameter(Mandatory)] [string] $Summary,
        [string[]]             $Todos = @(),
        [string[]]             $FilesTouched = @(),
        [string]               $Doc,
        [string]               $Repo = 'FrozenRegister/holmgard-lore-editor',
        [ValidateSet('Todo', 'In Progress', 'Done')] [string] $Status = 'Todo',
        [string]               $ProjectOwner = 'FrozenRegister',
        [int]                  $ProjectNumber = 3,
        [string]               $ProjectNodeId = 'PVT_kwHOEMCAyM4BZ3n-',
        [switch]               $DryRun
    )

    $sessionDate = (Get-Date).ToString('yyyy-MM-dd')
    $projectUrl  = "https://github.com/users/$ProjectOwner/projects/$ProjectNumber"

    $sections = New-Object System.Collections.Generic.List[string]
    $sections.Add("**Status: $Status. Session: $sessionDate**")
    $sections.Add("## Summary`n$Summary")

    if ($Todos -and $Todos.Count -gt 0) {
        $todoLines = ($Todos | ForEach-Object { "- [ ] $_" }) -join "`n"
        $sections.Add("## Todos (for next session)`n$todoLines")
    }

    if ($FilesTouched -and $FilesTouched.Count -gt 0) {
        $fileLines = ($FilesTouched | ForEach-Object { "- ``$_``" }) -join "`n"
        $sections.Add("## Files touched`n$fileLines")
    }

    if ($Doc) {
        $sections.Add("## Context`nSee [$Doc]($Doc) for background and full spec.")
    }

    $sections.Add("Repo: $Repo | Project: $projectUrl")

    $body = $sections -join "`n`n"

    if ($DryRun) {
        Write-Host "----- DRY RUN: body that would be submitted -----"
        Write-Host $body
        Write-Host "-----------------------------------------------"
        return
    }

    # Create the draft issue. gh prints the new item URL to stdout.
    $createOut = gh project item-create $ProjectNumber `
        --owner $ProjectOwner `
        --title $Title `
        --body $body 2>&1

    if ($LASTEXITCODE -ne 0) {
        Write-Error "gh project item-create failed:`n$createOut"
        return
    }

    $itemUrl = ($createOut -split "`r?`n" | Where-Object { $_ -match '^https?://' } | Select-Object -First 1)
    if (-not $itemUrl) { $itemUrl = $createOut.Trim() }

    Write-Host "Created session summary:"
    Write-Host "  $itemUrl"

    # Move to In Progress / Done if requested
    if ($Status -ne 'Todo') {
        Write-Host "Setting status to $Status..."

        $listJson = gh project item-list $ProjectNumber --owner $ProjectOwner --format json --limit 50 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Could not list project items; status left as Todo."
            return
        }
        $items = ($listJson | ConvertFrom-Json).items
        $newItem = $items | Where-Object { $_.content.url -eq $itemUrl } | Select-Object -First 1
        if (-not $newItem) {
            Write-Warning "Could not find project item id for $itemUrl; status left as Todo."
            return
        }

        $fieldJson = gh project field-list $ProjectNumber --owner $ProjectOwner --format json 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Could not list project fields; status left as Todo."
            return
        }
        $statusField = ($fieldJson | ConvertFrom-Json).fields | Where-Object { $_.name -eq 'Status' } | Select-Object -First 1
        $option      = $statusField.options | Where-Object { $_.name -eq $Status } | Select-Object -First 1

        if (-not $statusField -or -not $option) {
            Write-Warning "Could not find Status field/option in project; status left as Todo."
            return
        }

        gh project item-edit `
            --id $newItem.id `
            --project-id $ProjectNodeId `
            --field-id $statusField.id `
            --single-select-option-id $option.id 2>&1 | Out-Null

        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Status update via gh project item-edit failed; item is created with Todo status."
        }
    }
}
