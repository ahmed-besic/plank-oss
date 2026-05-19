# Plank

Plank is an open-source, extensible card-based workflow platform for teams. Cards are the atomic unit; plugins shape them into project boards, task trackers, or whatever the team needs. Community extensions let teams adopt workflows others have built or create their own.

## Language

**Workspace**:
The top-level organizational boundary. A team's instance of Plank. Contains boards, members, card types, tags, and behavior rules. A hard tenant boundary — no data crosses between workspaces. This is a security constraint, not a product choice.
_Avoid_: Organization, account, project

**Member**:
A user who belongs to a workspace with a specific role (owner, admin, member).
_Avoid_: User (ambiguous — could mean app-wide user or workspace member)

**Board**:
A collection of cards organized by a board type. A board has views (kanban, calendar, etc.) that are interchangeable lenses over the same cards.
_Avoid_: Project, list, container

**Card**:
The atomic work item. Every card has a type, a title, optional properties, tags, a rich-text body, and relations to other cards. Cards live on boards.
_Avoid_: Task, item, ticket (unless a plugin specifically uses those terms)

**Card Type**:
A schema definition that declares what properties a card can have. Schema only — does not define rendering or where the card can appear. The canonical store is `cardTypeRegistry` (workspace-scoped, linked to a plugin).
_Avoid_: Template, kind

**Board Type**:
Defines the workflow semantics for a board: lifecycle statuses and board-level process behavior. Workflow only — does not own card rendering or restrict card types.
_Avoid_: Workflow type, board template

**Lifecycle Status**:
A named stage in a board type's workflow (e.g. "To Do", "In Progress", "Done"). Each status has a category (todo, active, done, custom).
_Avoid_: Column (the UI calls them columns, but the canonical concept is status)

**Tag**:
A workspace-scoped label that can be applied to cards. Tags are freeform — they don't affect workflow.
_Avoid_: Label, category, tag definition (just "tag")

**Property**:
A typed field defined by a card type's schema. Properties have a key, label, value type, and optional config. Users add properties to card types, not to individual cards.
_Avoid_: Field, attribute

**Plugin**:
A package that extends Plank's capabilities — registering views, card types, property types, commands, and event hooks. All plugins are optional. Plugins are open-source; teams can build their own or use community ones.
_Avoid_: Addon, integration

**Extension**:
A plugin installed in a workspace with an enable/disable status. Users manage extensions; developers build plugins.
_Avoid_: Plugin (when referring to the installed instance, not the package)

**Behavior Pack**:
A set of rules that react to card events (created, moved, tagged, etc.) and perform actions (set property, move status, notify, etc.). Users see this as "Automation" in the UI — "behavior" is the architectural term; "automation" is the user-facing label.
_Avoid_: Workflow rule, trigger

**Workflow Event**:
The canonical event record for a card change. Tracks full lineage (eventId, rootEventId, parentEventId, depth), origin (user or automation), and rich change metadata (patch, previous properties, activity entries). Used by the behavior runtime for cascading automation.
_Avoid_: Card change event (the lightweight projection)

**Card Change Event**:
A denormalized projection of a workflow event for the activity feed UI. Contains only the change kind, property keys, and timestamp. Not used by the behavior runtime.
_Avoid_: Workflow event (when referring to the activity feed projection)

**Relation**:
A typed link between two cards. Relation types: relates_to, blocked_by, references.
_Avoid_: Link, connection, dependency

## Relationships

- A **Workspace** has many **Members**, **Boards**, **Board Types**, **Card Types**, and **Tags**
- A **Board** belongs to exactly one **Board Type**
- A **Board Type** defines **Lifecycle Statuses**
- A **Card** lives on exactly one **Board** and has exactly one **Card Type**
- A **Card Type** declares what **Properties** a card can have
- Any **Card Type** can appear on any **Board** — board types do not restrict card types
- A **Card** can have many **Tags**, **Relations** to other cards, and an optional parent **Card** (parent-child hierarchy, currently subtask-style but could be opened for user-defined meaning)
- A **Plugin** registers **Card Types**, views, property types, commands, and event hooks
- A **Behavior Pack** is attached to targets (workspace, board, board type, card type, tag) via **Bindings**

## Example dialogue

> **Dev:** "When a **Member** creates a **Card**, does the **Card Type** determine which **Properties** are available?"
> **Domain expert:** "Yes — the **Card Type** schema defines the properties. Workspace **Members** add properties to card types, not to individual cards. And **Plugins** can register new property types."
>
> **Dev:** "Can a note card appear on a task board?"
> **Domain expert:** "Yes — any **Card Type** can appear on any **Board**. The board view decides what to show. If a field is absent, the view omits it instead of breaking."

## Separation of concerns

The target architecture has four clean layers:

- **Card Type** = schema (what fields a card may have)
- **Card** = data instance (values for those fields)
- **Board Type** = workflow (statuses, lifecycle rules)
- **Board View / Plugin** = presentation (how cards appear on a surface)

Card types do not define rendering. Board types do not restrict card types. Cards do not carry view-specific state. Views decide what to display and gracefully degrade when a card type lacks expected fields.
