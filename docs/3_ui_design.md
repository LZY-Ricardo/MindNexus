# 3. UI/UX Design Specifications

## Design System Basics
* **Framework:** Tailwind CSS
* **Component Library:** shadcn/ui (Radix UI)
* **Theme:** System Preference (Auto Dark/Light)
* **Primary Color:** Zinc/Slate (Minimalist, monochromatic with subtle accents).
* **Radius:** `0.5rem` (Rounded-md).

## View 1: The Floating Window (Portal)
**Concept:** A lightweight, global spotlight-like search bar.

* **Layout:**
    * **Collapsed State:** A single input bar (Height: 60px).
    * **Expanded State:** Input bar + Results Area (Height: 400px).
* **Visual Style:**
    * Background: `bg-background/80` with `backdrop-blur-xl` (Glassmorphism).
    * Borderless (`frame: false` in Electron).
    * Rounded corners: `rounded-xl`.
* **Interactions:**
    * **Drag & Drop:** When a file is dragged over, overlay a `div` with `bg-primary/20` and dashed border.
    * **Input:** Press `Enter` to search -> Expands window to show results.

## View 2: Main Window (Dashboard)
**Concept:** The control center for knowledge management.

* **Layout:** Standard Sidebar Layout.
    * **Sidebar (Left, 250px):** Fixed width, `border-r`. Contains Navigation.
    * **Header (Top, 60px):** Breadcrumbs, Theme Toggle.
    * **Content Area:** Scrollable.

### Key Pages

#### 1. Dashboard (`/`)
* **Stats Cards:** "Total Files", "Knowledge Chunks", "Storage Used".
* **Recent Activity:** List of recently added files.

#### 2. Chat Interface (`/chat`)
* **Style:** ChatGPT-like layout.
* **Message Bubbles:**
    * User: `bg-primary text-primary-foreground`.
    * AI: `bg-muted`.
* **Source Citation:** Below AI response, show distinct "Sources" badges. Clicking a badge opens the source file.

#### 3. File Library (`/files`)
* **Component:** Data Table (using `@tanstack/react-table` via shadcn).
* **Columns:** Name, Type, Size, Status (Badge), Actions (Delete).

## Component Requirements
(Install these shadcn components)
* `button`, `input`, `card`, `scroll-area`, `separator`
* `badge`, `dialog`, `table`, `dropdown-menu`, `toast`