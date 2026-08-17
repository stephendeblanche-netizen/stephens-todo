import * as Haptics from "expo-haptics";
import NetInfo from "@react-native-community/netinfo";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Modal, Platform, Pressable, RefreshControl, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { createCategoryRemote, createDirectReportRemote, getDashboard } from "./src/api";
import { addTemporaryTask, applyTaskPatch, cacheDashboard, enqueueMutation, flushQueuedMutations, loadCachedDashboard, queueLength } from "./src/offlineSync";
import { configurePushReminders, remindersEnabled } from "./src/notifications";
import { dueText, orderTasks, priorityColor, taskMatchesPriority } from "./src/taskUtils";
import type { Category, DashboardPayload, DirectReport, Priority, Task, TaskCreateInput } from "./src/types";

const haptic = () => { if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };
const priorities: Array<"all" | Priority> = ["all", "high", "medium", "low"];
type Creator = "menu" | "task" | "category" | "subCategory" | "directReport" | null;

function TaskRow({ task, category, directReports, save, onCreateSubcategory }: { task: Task; category?: Category; directReports: DirectReport[]; save: (patch: Partial<Task>) => Promise<void>; onCreateSubcategory: (parent: Task) => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(task.note);
  const action = (patch: Partial<Task>) => { haptic(); void save(patch); };
  return <View style={[styles.card, task.done && styles.done]}>
    <View style={styles.row}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: task.done }} onPress={() => action({ done: !task.done })} style={[styles.check, task.done && styles.checkOn]}><Text style={styles.checkMark}>{task.done ? "✓" : ""}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => { haptic(); setOpen(!open); }} style={styles.content}><Text style={[styles.title, task.done && styles.strike]} numberOfLines={2}>{task.text}</Text><Text style={styles.meta}>{category?.name ?? "Tasks"} · {dueText(task.dueAt)}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Change priority for ${task.text}`} onPress={() => { haptic(); setOpen(!open); }} style={[styles.flag, { borderColor: priorityColor(task.priority) }]}><Text numberOfLines={1} style={{ color: priorityColor(task.priority), fontWeight: "700", fontSize: 11 }}>⚑ {task.priority}</Text></Pressable>
    </View>
    {open && <View style={styles.details}>
      <Text style={styles.label}>Priority</Text><View style={styles.detailChips}>{(["high", "medium", "low"] as Priority[]).map((entry) => <Pressable key={entry} accessibilityRole="button" accessibilityLabel={`Set priority ${entry}`} onPress={() => action({ priority: entry })} style={[styles.chip, task.priority === entry && { borderColor: priorityColor(entry), backgroundColor: "#FFFFFF" }]}><Text style={{ color: priorityColor(entry), fontSize: 12, fontWeight: "700" }}>{entry}</Text></Pressable>)}</View>
      <Text style={styles.label}>Accountable Direct Report</Text><View style={styles.detailChips}><Pressable accessibilityRole="button" accessibilityLabel={`Assign no Direct Report to ${task.text}`} onPress={() => action({ accountableDirectReportId: null })} style={[styles.chip, task.accountableDirectReportId === null && styles.chipOn]}><Text style={styles.chipText}>N/A</Text></Pressable>{directReports.map((report) => <Pressable key={report.id} accessibilityRole="button" accessibilityLabel={`Assign ${report.name} to ${task.text}`} onPress={() => action({ accountableDirectReportId: report.id })} style={[styles.chip, task.accountableDirectReportId === report.id && styles.chipOn]}><Text style={styles.chipText}>{report.name}</Text></Pressable>)}</View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Add sub-category under ${task.text}`} onPress={() => onCreateSubcategory(task)} style={styles.subcategoryAction}><Text style={styles.subcategoryActionText}>＋ Add sub-category</Text></Pressable>
      <Text style={styles.label}>Notes</Text><TextInput value={note} onChangeText={setNote} onBlur={() => note !== task.note && action({ note })} placeholder="Add a note…" multiline accessibilityLabel={`Notes for ${task.text}`} style={styles.notes} />
    </View>}
  </View>;
}

export default function App() {
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [category, setCategory] = useState<number | "all">("all");
  const [priority, setPriority] = useState<"all" | Priority>("all");
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creator, setCreator] = useState<Creator>(null);
  const [text, setText] = useState("");
  const [subCategoryParent, setSubCategoryParent] = useState<Task | null>(null);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [reminders, setReminders] = useState(false);
  const syncing = useRef(false);
  const load = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true; setError(null);
    try { const replayed = await flushQueuedMutations(); const fresh = replayed ?? await getDashboard(); setDashboard(fresh); await cacheDashboard(fresh); setPending(await queueLength()); }
    catch (reason) { const cached = await loadCachedDashboard(); if (cached) setDashboard(cached); else setError(reason instanceof Error ? reason.message : "Could not load tasks"); }
    finally { syncing.current = false; setLoading(false); }
  }, []);
  useEffect(() => {
    let mounted = true;
    void (async () => { const cached = await loadCachedDashboard(); if (mounted && cached) { setDashboard(cached); setLoading(false); } if (mounted) { setReminders(await remindersEnabled()); setPending(await queueLength()); } const state = await NetInfo.fetch(); if (mounted) { setOnline(Boolean(state.isConnected && state.isInternetReachable !== false)); if (state.isConnected) void load(); } })();
    const unsubscribe = NetInfo.addEventListener((state) => { const connected = Boolean(state.isConnected && state.isInternetReachable !== false); setOnline(connected); if (connected) void load(); });
    return () => { mounted = false; unsubscribe(); };
  }, [load]);
  const tasks = useMemo(() => dashboard ? orderTasks(dashboard.tasks, dashboard.categories).filter((task) => (category === "all" || task.categoryId === category) && (completed || !task.done) && taskMatchesPriority(task, priority)) : [], [dashboard, category, completed, priority]);
  const save = async (task: Task, patch: Partial<Task>) => { if (!dashboard) return; const next = applyTaskPatch(dashboard, task.id, patch); setDashboard(next); await cacheDashboard(next); await enqueueMutation({ type: "patch", taskId: task.id, patch }); setPending(await queueLength()); if (online) void load(); };
  const closeCreator = () => { setCreator(null); setText(""); setSubCategoryParent(null); };
  const openCreator = (next: Exclude<Creator, null>) => { haptic(); setText(""); setCreator(next); };
  const createTask = async (parent: Task | null) => {
    if (!text.trim() || !dashboard) return;
    if (parent && parent.id < 0) { Alert.alert("Waiting to sync", "This parent item must finish syncing before you can add a sub-category beneath it."); return; }
    const categoryId = parent?.categoryId ?? (category === "all" ? dashboard.categories[0]?.id : category);
    if (!categoryId) { Alert.alert("Add a category first", "Create a category before adding work items."); return; }
    const siblingCount = dashboard.tasks.filter((item) => item.categoryId === categoryId && (item.parentId ?? null) === (parent?.id ?? null)).length;
    const input: TaskCreateInput = { categoryId, ...(parent ? { parentId: parent.id } : {}), text: text.trim(), sortOrder: siblingCount, priority: "medium", mobileClientMutationId: `mobile-create-${Date.now()}-${Math.random().toString(36).slice(2)}` };
    const next = addTemporaryTask(dashboard, input); const temporaryTaskId = next.tasks[next.tasks.length - 1].id;
    setDashboard(next); await cacheDashboard(next); await enqueueMutation({ type: "create", temporaryTaskId, input }); setPending(await queueLength()); closeCreator(); if (online) void load();
  };
  const createEntity = async () => {
    if (!text.trim() || !dashboard || !creator || creator === "menu") return;
    if (creator === "task") { await createTask(null); return; }
    if (creator === "subCategory") { await createTask(subCategoryParent); return; }
    if (!online) { Alert.alert("Connect to add", "Categories and Direct Reports are added to the shared dashboard when you are online."); return; }
    try { if (creator === "category") { const created = await createCategoryRemote({ name: text.trim(), sortOrder: dashboard.categories.length }); setCategory(created.id); } else if (creator === "directReport") await createDirectReportRemote({ name: text.trim(), sortOrder: dashboard.directReports.length }); closeCreator(); await load(); }
    catch (reason) { Alert.alert("Could not save", reason instanceof Error ? reason.message : "Please try again."); }
  };
  const toggleReminders = async () => { const result = await configurePushReminders(!reminders); setReminders(result.enabled); Alert.alert("Task reminders", result.message); };
  const formTitle = creator === "category" ? "Add category" : creator === "directReport" ? "Add Direct Report" : creator === "subCategory" ? "Add sub-category" : "Add task";
  const formPlaceholder = creator === "category" ? "Category name" : creator === "directReport" ? "Direct Report name" : creator === "subCategory" ? "Sub-category name" : "What needs doing?";
  if (loading) return <SafeAreaView style={styles.center}><StatusBar style="dark" /><ActivityIndicator color="#257863" /><Text style={styles.loading}>Loading Stephen’s tasks…</Text></SafeAreaView>;
  return <SafeAreaView style={styles.screen}><StatusBar style="dark" />
    <View style={styles.header}><View><Text style={styles.eyebrow}>STEPHEN’S WORKSPACE</Text><Text style={styles.heading}>To-Do</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Add item" onPress={() => openCreator("menu")} style={styles.add}><Text style={styles.addText}>＋ Add</Text></Pressable></View>
    <View style={styles.syncBar}><Text style={styles.syncText}>{online ? (pending ? `${pending} change${pending === 1 ? "" : "s"} syncing…` : "Synced across devices") : `${pending ? `${pending} change${pending === 1 ? "" : "s"} queued` : "Offline cache active"}`}</Text><Pressable accessibilityRole="switch" accessibilityState={{ checked: reminders }} accessibilityLabel="Toggle task reminders" onPress={() => void toggleReminders()} style={[styles.reminderToggle, reminders && styles.reminderToggleOn]}><Text style={[styles.reminderText, reminders && styles.reminderTextOn]}>⚑ Reminders {reminders ? "on" : "off"}</Text></Pressable></View>
    {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => void load()}><Text style={styles.retry}>Try again</Text></Pressable></View> : <>
      <FlatList horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroller} data={[{ id: "all", name: "All tasks" }, ...(dashboard?.categories ?? [])]} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.categoryList} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Filter by ${item.name}`} onPress={() => { haptic(); setCategory(item.id as number | "all"); }} style={[styles.category, category === item.id && styles.categoryOn]}><Text numberOfLines={1} ellipsizeMode="tail" style={[styles.categoryText, category === item.id && styles.categoryTextOn]}>{item.name}</Text></Pressable>} />
      <View style={styles.filters}><View style={styles.chips}>{priorities.map((item) => <Pressable key={item} onPress={() => setPriority(item)} style={[styles.chip, priority === item && styles.chipOn]}><Text style={styles.chipText}>{item}</Text></Pressable>)}</View><Pressable onPress={() => setCompleted(!completed)}><Text style={styles.toggle}>{completed ? "Hide completed" : "Show completed"}</Text></Pressable></View>
      <FlatList data={tasks} keyExtractor={(task) => String(task.id)} contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor="#257863" />} renderItem={({ item }) => <TaskRow task={item} category={dashboard?.categories.find((entry) => entry.id === item.categoryId)} directReports={dashboard?.directReports ?? []} save={(patch) => save(item, patch)} onCreateSubcategory={(parent) => { setSubCategoryParent(parent); openCreator("subCategory"); }} />} ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>No matching tasks</Text><Text style={styles.meta}>Adjust a filter or add your next task.</Text></View>} />
    </>}
    <Modal visible={creator !== null} transparent animationType="slide" onRequestClose={closeCreator}><View style={styles.backdrop}><View style={styles.modal}>
      {creator === "menu" ? <><Text style={styles.modalTitle}>Add to To-Do</Text><Text style={styles.modalHint}>Create something that will sync across your dashboard and devices.</Text><Pressable accessibilityRole="button" accessibilityLabel="Add task" onPress={() => openCreator("task")} style={styles.menuAction}><Text style={styles.menuActionTitle}>Task</Text><Text style={styles.menuActionHint}>Add a work item to the selected category.</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Add category" onPress={() => openCreator("category")} style={styles.menuAction}><Text style={styles.menuActionTitle}>Category</Text><Text style={styles.menuActionHint}>Create a new top-level category.</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Add Direct Report" onPress={() => openCreator("directReport")} style={styles.menuAction}><Text style={styles.menuActionTitle}>Direct Report</Text><Text style={styles.menuActionHint}>Add a person you can assign to work items.</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Close add menu" onPress={closeCreator}><Text style={styles.cancel}>Cancel</Text></Pressable></> : <><Text style={styles.modalTitle}>{formTitle}</Text>{creator === "subCategory" && <Text style={styles.modalHint}>This will be nested beneath “{subCategoryParent?.text ?? "the selected item"}”.</Text>}<TextInput autoFocus value={text} onChangeText={setText} onSubmitEditing={() => void createEntity()} returnKeyType="done" placeholder={formPlaceholder} accessibilityLabel={formTitle} style={styles.input} /><View style={styles.actions}><Pressable onPress={closeCreator}><Text style={styles.cancel}>Cancel</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Confirm ${formTitle.toLowerCase()}`} onPress={() => void createEntity()} style={styles.save}><Text style={styles.saveText}>{formTitle}</Text></Pressable></View></>}
    </View></View></Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F5F3ED" }, center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F5F3ED" }, loading: { marginTop: 12, color: "#52635F" }, header: { padding: 20, paddingBottom: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, eyebrow: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: "#257863" }, heading: { fontSize: 34, fontWeight: "800", color: "#172522" }, add: { backgroundColor: "#257863", borderRadius: 12, paddingHorizontal: 15, paddingVertical: 10 }, addText: { color: "#FFF", fontWeight: "800" }, syncBar: { marginHorizontal: 16, marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, syncText: { fontSize: 11, fontWeight: "700", color: "#63736D", flex: 1 }, reminderToggle: { borderWidth: 1, borderColor: "#D7DDD9", borderRadius: 16, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: "#FFF" }, reminderToggleOn: { backgroundColor: "#DDF1E9", borderColor: "#257863" }, reminderText: { fontSize: 11, fontWeight: "800", color: "#63736D" }, reminderTextOn: { color: "#17614F" }, categoryScroller: { height: 48, flexGrow: 0, flexShrink: 0 }, categoryList: { alignItems: "center", paddingHorizontal: 16, gap: 7, flexGrow: 0 }, category: { height: 40, maxWidth: 176, justifyContent: "center", paddingHorizontal: 12, borderWidth: 1, borderColor: "#D7DDD9", borderRadius: 18, backgroundColor: "#FFF" }, categoryOn: { backgroundColor: "#DDF1E9", borderColor: "#257863" }, categoryText: { fontWeight: "600", fontSize: 12, lineHeight: 16, color: "#53645F" }, categoryTextOn: { color: "#17614F" }, filters: { marginHorizontal: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }, chips: { flexDirection: "row", gap: 6, flexShrink: 1 }, chip: { borderWidth: 1, borderColor: "#D7DDD9", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 }, chipOn: { borderColor: "#257863", backgroundColor: "#DDF1E9" }, chipText: { fontSize: 12, fontWeight: "700", textTransform: "capitalize", color: "#42534E" }, toggle: { fontSize: 12, fontWeight: "700", color: "#257863", flexShrink: 0 }, list: { padding: 16, paddingTop: 10, paddingBottom: 44 }, card: { backgroundColor: "#FFF", borderColor: "#E1E5E1", borderWidth: 1, borderRadius: 14, overflow: "hidden", marginBottom: 9 }, done: { opacity: 0.58 }, row: { padding: 12, flexDirection: "row", alignItems: "flex-start", gap: 10 }, check: { height: 22, width: 22, marginTop: 5, borderRadius: 7, borderWidth: 1.5, borderColor: "#AAB5B0", alignItems: "center", justifyContent: "center" }, checkOn: { backgroundColor: "#257863", borderColor: "#257863" }, checkMark: { color: "#FFF", fontWeight: "800" }, content: { flex: 1, minWidth: 0 }, title: { fontSize: 15, lineHeight: 20, fontWeight: "600", color: "#1F302B" }, strike: { textDecorationLine: "line-through" }, meta: { fontSize: 12, lineHeight: 16, color: "#73817C", marginTop: 3 }, flag: { minWidth: 78, alignItems: "center", marginTop: 2, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 }, details: { padding: 12, borderTopWidth: 1, borderTopColor: "#E1E5E1", backgroundColor: "#FAFCFA", gap: 7 }, label: { fontSize: 12, fontWeight: "800", color: "#53645F" }, detailChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 }, subcategoryAction: { alignSelf: "flex-start", paddingVertical: 5 }, subcategoryActionText: { color: "#17614F", fontSize: 12, fontWeight: "800" }, notes: { minHeight: 68, borderWidth: 1, borderColor: "#D7DDD9", backgroundColor: "#FFF", borderRadius: 10, padding: 9, textAlignVertical: "top", color: "#1F302B" }, empty: { alignItems: "center", paddingTop: 70 }, emptyTitle: { fontSize: 18, fontWeight: "800", color: "#1F302B" }, error: { margin: 16, padding: 16, backgroundColor: "#FCE8E6", borderRadius: 12 }, errorText: { color: "#A4312E", fontWeight: "700" }, retry: { color: "#A4312E", fontWeight: "800", marginTop: 8 }, backdrop: { flex: 1, backgroundColor: "rgba(20,32,28,.45)", justifyContent: "flex-end" }, modal: { backgroundColor: "#FFF", padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 12 }, modalTitle: { fontSize: 22, fontWeight: "800", color: "#1F302B" }, modalHint: { fontSize: 13, lineHeight: 18, color: "#63736D" }, menuAction: { borderWidth: 1, borderColor: "#D7DDD9", borderRadius: 12, padding: 13, gap: 3 }, menuActionTitle: { color: "#1F302B", fontSize: 16, fontWeight: "800" }, menuActionHint: { color: "#63736D", fontSize: 12, lineHeight: 16 }, input: { borderWidth: 1, borderColor: "#D7DDD9", borderRadius: 10, padding: 12, fontSize: 16, color: "#1F302B" }, actions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 16 }, cancel: { fontWeight: "700", color: "#53645F", paddingVertical: 7 }, save: { backgroundColor: "#257863", borderRadius: 10, paddingHorizontal: 15, paddingVertical: 10 }, saveText: { color: "#FFF", fontWeight: "800" },
});
