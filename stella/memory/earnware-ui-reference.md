# Earnware UI Reference

**URL:** https://app.earnware.ai  
**Documented:** 2026-02-03  
**Organization:** Reliable Media

---

## Navigation Structure

### Top Nav Bar
| Item | URL | Type | Notes |
|------|-----|------|-------|
| Dashboard | `/` | Link | |
| Feeds | `/content/feeds` | Link | |
| Tasks | `/tasks` | Link | |
| **Publishing** | — | Dropdown | See submenu below |
| Images | `/images` | Link | |
| Support | `/support` | Link | |
| Settings (gear icon) | `/settings` | Icon link | |
| Theme Toggle | — | Button | |
| User Menu | — | Button | |

### Publishing Dropdown Submenu
| Item | URL |
|------|-----|
| Pub Orders | `/pub-orders` |
| Planner | `/planner` |
| Library | `/library` |
| Wordpress | `/wordpress-posts` |
| Workshop | `/workshop` |
| Content Categories | `/content-categories` |
| Earnware Campaigns | `/campaigns` |

---

## 1. Dashboard (`/`)

**Heading:** "Welcome, you're logged into [Organization Name]"

### Content Tools Grid (6 cards)
| Card | URL | Description |
|------|-----|-------------|
| Tasks | `/tasks` | Manage your AI tasks |
| Planner | `/planner` | Plan and schedule your content |
| Content Feed | `/content/feeds` | Monitor RSS feeds for content updates |
| Pub Orders | `/pub-orders` | Manage publication orders and content |
| WordPress Posts | `/wordpress-posts` | Manage WordPress content and posts |
| Images | `/images` | Manage and organize your images |

---

## 2. Tasks (`/tasks`)

**Heading:** "Tasks"  
**Subtitle:** "Monitor and manage all background operations"

### Actions
- **New Task** button
- **Refresh** button

### Filters
| Filter | Type | Options |
|--------|------|---------|
| Search | Text input | Search tasks, feed titles, instance IDs, step names... |
| Status | Dropdown | All Status, Pending, Running, Completed, Failed |
| Type | Dropdown | All Types, ai_image_analysis, Pub Order Creation, Workflow Step |
| Brand | Dropdown | All Brands, [brand list] |
| Filter | Button | Apply filters |
| Clear | Button | Clear filters |

### Table Columns
| Column | Notes |
|--------|-------|
| Select (checkbox) | Bulk select |
| Type | Emoji + task type (e.g., 📋 ai_image_analysis, ✍️ Workflow Step, 🔍 Workflow Step) |
| Task Name | With step indicator (e.g., "Step 1 Original: [title]") |
| Status | ✅ Completed, ⏳ Running, etc. |
| Assigned | Usually "System" |
| Created | Date + time (PST) |
| Instance ID | Truncated UUID button |
| Actions | Delete Task button |

### Pagination
- "Showing 1 to 50 of XXXX tasks"
- Show: dropdown (50, 100, etc.)
- Page X of Y
- Previous/Next buttons

---

## 3. Feeds (`/content/feeds`)

### Tabs
1. **Feed Items** (default) — List of feed articles
2. **Feed Sources** — Manage RSS feed sources

### Feed Items View

#### Filters
| Filter | Type |
|--------|------|
| Search | Text input (Search title or description...) |
| Source | Dropdown (All Sources) |
| From | Date picker |
| To | Date picker |
| My Bookmarks | Checkbox |
| Reserved Items | Checkbox |
| Fetch Feeds (X) | Button with count |

#### List Item Structure
Each feed item shows:
- Checkbox for selection
- Thumbnail image (if available)
- **Title** (bold)
- **Actions:** Bookmark, Reserve, Research options buttons
- **Summary** (AI-generated description)
- **Metadata:**
  - Added: date/time
  - Published: date/time
  - Source: feed name
  - Full Story link

---

## 4. Planner (`/planner`)

**Heading:** "Pub Planner"

### Actions
- **Sync Orders** button
- **Add Week** button with dropdown
- **Pub Orders** link

### Filters
| Filter | Type |
|--------|------|
| Date Range | Button picker (e.g., "Feb 02, 2026 - Feb 08, 2026") |
| Status | Dropdown (All Statuses) |
| Slot | Dropdown (All) |
| QA | Dropdown (All QA) |
| Brands | Dropdown (All Brands (X)) |

### Table Columns
| Column | Notes |
|--------|-------|
| Select (checkbox) | |
| Date | MM/DD/YYYY |
| WordPress Pub Time | HH:MM AM/PM PST |
| Send Time | HH:MM AM/PM PST |
| Brand | Domain name |
| Slot | S1, S2, S2 - PM Trivia, etc. |
| Status | Pending, Email Scheduled (clickable button) |
| QA | Dropdown (No Status Set) |
| Featured Post | Link to pub order or "N/A" |
| Notes | - |
| Actions | Link Existing Order, Delete Plan Entry |

---

## 5. Pub Orders (`/pub-orders`)

**Heading:** "Pub Orders"

### Actions
- Grid/List view toggle
- **Refresh** button
- **Create New Order** link
- **Pub Planner** link

### Filters
| Filter | Type |
|--------|------|
| Search | Text input (Search orders: ID, subject, featured post, template) |
| Creator | Dropdown (All Creators) |
| Status | Dropdown (All Statuses) |
| Category | Dropdown (All Categories) |
| Brand | Dropdown (All Brands) |
| Date | Date picker button |

### Table Columns
| Column | Notes |
|--------|-------|
| Select (checkbox) | |
| ID | Numeric order ID |
| Brand | Domain or "No Brand" |
| Created By | Name + email |
| Featured Post | Link to order detail |
| Scheduled | Date + Slot + Time or "—" |
| Status | Pending, Email Scheduled, Done Archive, etc. |
| Drafts | ? if none |
| Best QA | – if none |
| Categories | List or "—" with edit button |
| Created At | Date/time |
| Updated At | Date/time |
| Actions | Clone, Assign to Library, Delete |

---

## 6. Pub Order Detail (`/pub-order/:id/`)

### Status Progress Bar (clickable steps)
1. Pending
2. Final Edit
3. WP Draft
4. WP Scheduled
5. Email Draft
6. Email Scheduled
7. Done Archive

### Header
- Back button
- **Title** (featured post headline)
- Order ID badge
- Brand badge
- **Update Pub Order** button

### Tabs
1. **Details** (default)
2. **WordPress Content**
3. **ESP Campaign**

### Details Tab

#### General Information
| Field | Type | Notes |
|-------|------|-------|
| Brand | Dropdown (disabled if linked to planner) |
| Content Type | Dropdown (disabled if linked to planner) |
| Categories | Tag list + edit button |
| Planner Link | Shows slot + date/time, Unlink/View buttons |

#### Featured Media
- Tabs: **Image** / **Video**
- Image preview with selection status
- Image Alt Text input
- Change Image / Remove Image buttons

#### Content Section
Tabs: **Content Drafts** / **Content Research (X)**

##### Content Drafts
| Column | Notes |
|--------|-------|
| Select (radio) | Single selection |
| Headline | Draft title |
| Prompt Used | e.g., "A1 MAGA News Writer" |
| AI Model | e.g., "ChatGPT GPT-4o", "Claude claude-sonnet" |
| QA | Score (0-100) |
| Updated | Date/time |
| Actions | View, Delete |

- AI Model dropdown for new drafts
- Create Draft button
- Clear selection option

---

## 7. Images (`/images`)

**Heading:** "Image Library"  
**Subtitle:** "Manage your organization's images for pub orders and campaigns"

### Actions
- **Upload Images** button

### Filters
| Filter | Type |
|--------|------|
| Search | Text input (Search by keywords: name, description, alt text, or tags...) |
| Filter | Dropdown (All Images) |
| View Toggle | Grid / List radio buttons |

### Image Grid
Each image card shows:
- Thumbnail
- Checkbox for selection
- Expand/preview button
- Filename
- File size
- Alt text
- Tags (with "+X" overflow indicator)
- Status badge (Complete)

### Pagination
- "Images (X of Y) Page X of Y"
- Select all on page checkbox
- Show: dropdown (100, etc.) per page

---

## 8. Library (`/library`)

### Workflow Selector
- Dropdown: "Story Publishing Workflow" (and others)

### Actions
- Settings button
- **New Library Item** button

### Filters
| Filter | Type |
|--------|------|
| Search | Text input (Search by name or subject...) |
| Tags | Dropdown (All Tags) |
| Categories | Dropdown (All Categories) |

### Table Columns
| Column | Notes |
|--------|-------|
| Expand | Chevron to expand row |
| Name | Item name + description |
| Tags | Tag list |
| Pub Orders | Count |
| Actions | Settings, Generate button |

---

## 9. WordPress Posts (`/wordpress-posts`)

**Heading:** "WordPress Posts"  
**Subtitle:** "Manage and view WordPress posts from your connected sites"

### Brand Selector
- Dropdown to select a brand
- Note: "WordPress posts are brand-specific for better performance and organization"

---

## 10. Workshop (`/workshop`)

**Heading:** "Workshop"

### Tabs
1. **Generate Ideas** (default)
2. **Add a Topic**

### Generate Ideas Form
| Field | Type |
|-------|------|
| Parent Category * | Text input (e.g., Marketing) |
| Sub-category | Text input (e.g., Email Marketing) |
| # Ideas | Number spinner (default: 6) |
| AI Connection | Dropdown (ChatGPT, etc.) |
| Prompt | Text area |
| Generate Ideas | Button |

---

## 11. Content Categories (`/content-categories`)

**Heading:** "Content Categories"

### Actions
- **Add Category** button
- **Sync** button

### Brand Selector
- Dropdown: "All Brands" or specific brand

Note: "Select a Brand to view categories."

---

## 12. Campaigns (`/campaigns`)

**Heading:** "Campaigns Overview"

### Filters
| Filter | Type |
|--------|------|
| Organization | Dropdown (All Organizations) |
| Brand | Dropdown (All Brands) |

### Organization Cards
Each org shows:
- Organization name
- Select button
- API Key status ("No API Key Available")
- Brand list (clickable)

---

## 13. Support (`/support`)

**Heading:** "Support Center"  
**Subtitle:** "Find help, documentation, and system information"

### Quick Access Navigation
- Support Home
- System Status (`/support/status`)
- Change Log (`/support/change-log`)
- Template Variables (`/support/template-variables`)

### Welcome Section
- System status indicator ("All Systems Operational")
- Latest Updates badge

### Resource Cards
| Card | URL | Description |
|------|-----|-------------|
| System Status | `/support/status` | Real-time system health (Live badge) |
| Change Log | `/support/change-log` | Latest updates, features, bug fixes (Updated badge) |
| Template Variables | `/support/template-variables` | Complete reference (Reference badge) |

### Additional Resources
- Documentation list (Configuration Guide, API Reference, Best Practices)
- Contact Support button

---

## 14. Settings (`/settings`)

**Heading:** "Settings"

### User Settings
| Card | URL | Description |
|------|-----|-------------|
| Preferences | `/preferences` | Customize your experience |

### Organization Settings
| Card | URL | Description |
|------|-----|-------------|
| My Organization | — | Shows org name (e.g., "Reliable Media") |
| My Organization Brands | `/my-organization/brands` | Manage your organization's brands |
| My Organization Users | `/my-organization/users` | Manage your organization's members |

---

## Task Types (observed)

| Icon | Type Code | Description |
|------|-----------|-------------|
| 📋 | ai_image_analysis | AI image analysis task |
| 📋 | Pub Order Creation | Creating publication order (Step 3) |
| 🔍 | Workflow Step | Research step (Step 1) |
| ✍️ | Workflow Step | Writing/editing step (Step 2) |

---

## Status Flow (Pub Orders)

1. **Pending** → Order created, awaiting processing
2. **Final Edit** → Content ready for final review
3. **WP Draft** → WordPress draft created
4. **WP Scheduled** → WordPress post scheduled
5. **Email Draft** → Email campaign draft created
6. **Email Scheduled** → Email scheduled for send
7. **Done Archive** → Order completed and archived

---

## Brands (Reliable Media organization)

- dailytreasure.com
- freedomherald.com
- libertyfuel.org
- libertynewsalerts.com
- Placeholder Brand

---

## Common UI Patterns

### Dropdowns/Comboboxes
- Click to open options
- Often have chevron icon

### Tables
- Header row with column names
- Checkbox column for bulk selection
- Action buttons at row end

### Cards
- Icon + title + description pattern
- Often clickable/linkable

### Status Badges
- Color-coded (Pending, Email Scheduled, Completed, etc.)
- Sometimes clickable to change status

### Pagination
- "Showing X to Y of Z items"
- Page X of Y
- Previous/Next buttons
- Items per page dropdown
