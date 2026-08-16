import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Modal, Platform, Pressable, RefreshControl, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { addTask, getDashboard, patchTask } from "./src/api";
import { dueText, orderTasks, priorityColor, taskMatchesPriority } from "./src/taskUtils";
import type { Category, DashboardPayload, Priority, Task } from "./src/types";

const haptic = () => { if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };
const priorities: Array<"all" | Priority> = ["all", "high", "medium", "low"];

function TaskRow({ task, category, save }: { task: Task; category?: Category; save: (patch: Partial<Task>) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(task.note);
  const action = (patch: Partial<Task>) => { haptic(); void save(patch); };
  return <View style={[styles.card, task.done && styles.done]}>
    <View style={styles.row}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: task.done }} onPress={() => action({ done: !task.done })} style={[styles.check, task.done && styles.checkOn]}><Text style={styles.checkMark}>{task.done ? "✓" : ""}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => { haptic(); setOpen(!open); }} style={styles.content}>
        <Text style={[styles.title, task.done && styles.strike]} numberOfLines={2}>{task.text}</Text><Text style={styles.meta}>{category?.name ?? "Tasks"} · {dueText(task.dueAt)}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Change priority for ${task.text}`} onPress={() => { haptic(); setOpen(!open); }} style={[styles.flag, { borderColor: priorityColor(task.priority) }]}><Text style={{ color: priorityColor(task.priority), fontWeight: "700", fontSize: 11 }}>⚑ {task.priority}</Text></Pressable>
    </View>
    {open && <View style={styles.details}>
      <Text style={styles.label}>Priority</Text><View style={styles.chips}>{(["high", "medium", "low"] as Priority[]).map((priority) => <Pressable key={priority} accessibilityRole="button" accessibilityLabel={`Set priority ${priority}`} onPress={() => action({ priority })} style={[styles.chip, task.priority === priority && { borderColor: priorityColor(priority), backgroundColor: "#FFFFFF" }]}><Text style={{ color: priorityColor(priority), fontSize: 12, fontWeight: "700" }}>{priority}</Text></Pressable>)}</View>
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
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");

  const load = useCallback(async () => { setError(null); try { setDashboard(await getDashboard()); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load tasks"); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const tasks = useMemo(() => dashboard ? orderTasks(dashboard.tasks, dashboard.categories).filter((task) => (category === "all" || task.categoryId === category) && (completed || !task.done) && taskMatchesPriority(task, priority)) : [], [dashboard, category, completed, priority]);
  const save = async (task: Task, patch: Partial<Task>) => { if (!dashboard) return; const before = dashboard; setDashboard({ ...dashboard, tasks: dashboard.tasks.map((item) => item.id === task.id ? { ...item, ...patch } : item) }); try { await patchTask(task.id, patch); await load(); } catch (reason) { setDashboard(before); Alert.alert("Couldn’t save", reason instanceof Error ? reason.message : "Please try again."); } };
  const create = async () => { const categoryId = category === "all" ? dashboard?.categories[0]?.id : category; if (!text.trim() || !categoryId) return; try { await addTask(categoryId, text.trim()); setText(""); setAdding(false); await load(); } catch { Alert.alert("Couldn’t add task", "Please try again."); } };

  if (loading) return <SafeAreaView style={styles.center}><StatusBar style="dark" /><ActivityIndicator color="#257863" /><Text style={styles.loading}>Loading Stephen’s tasks…</Text></SafeAreaView>;
  return <SafeAreaView style={styles.screen}><StatusBar style="dark" />
    <View style={styles.header}><View><Text style={styles.eyebrow}>STEPHEN’S WORKSPACE</Text><Text style={styles.heading}>To-Do</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Add task" onPress={() => { haptic(); setAdding(true); }} style={styles.add}><Text style={styles.addText}>＋ Add</Text></Pressable></View>
    {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => void load()}><Text style={styles.retry}>Try again</Text></Pressable></View> : <>
      <FlatList horizontal showsHorizontalScrollIndicator={false} data={[{ id: "all", name: "All tasks" }, ...(dashboard?.categories ?? [])]} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.categoryList} renderItem={({ item }) => <Pressable onPress={() => { haptic(); setCategory(item.id as number | "all"); }} style={[styles.category, category === item.id && styles.categoryOn]}><Text style={[styles.categoryText, category === item.id && styles.categoryTextOn]}>{item.name}</Text></Pressable>} />
      <View style={styles.filters}><View style={styles.chips}>{priorities.map((item) => <Pressable key={item} onPress={() => setPriority(item)} style={[styles.chip, priority === item && styles.chipOn]}><Text style={styles.chipText}>{item}</Text></Pressable>)}</View><Pressable onPress={() => setCompleted(!completed)}><Text style={styles.toggle}>{completed ? "Hide completed" : "Show completed"}</Text></Pressable></View>
      <FlatList data={tasks} keyExtractor={(task) => String(task.id)} contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor="#257863" />} renderItem={({ item }) => <TaskRow task={item} category={dashboard?.categories.find((entry) => entry.id === item.categoryId)} save={(patch) => save(item, patch)} />} ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>No matching tasks</Text><Text style={styles.meta}>Adjust a filter or add your next task.</Text></View>} />
    </>}
    <Modal visible={adding} transparent animationType="slide"><View style={styles.backdrop}><View style={styles.modal}><Text style={styles.modalTitle}>Add task</Text><TextInput autoFocus value={text} onChangeText={setText} onSubmitEditing={() => void create()} placeholder="What needs doing?" style={styles.input} /><View style={styles.actions}><Pressable onPress={() => setAdding(false)}><Text style={styles.cancel}>Cancel</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Confirm add task" onPress={() => void create()} style={styles.save}><Text style={styles.saveText}>Add task</Text></Pressable></View></View></View></Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:"#F5F3ED"},center:{flex:1,justifyContent:"center",alignItems:"center",backgroundColor:"#F5F3ED"},loading:{marginTop:12,color:"#52635F"},header:{padding:20,paddingBottom:14,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},eyebrow:{fontSize:11,fontWeight:"700",letterSpacing:1,color:"#257863"},heading:{fontSize:34,fontWeight:"800",color:"#172522"},add:{backgroundColor:"#257863",borderRadius:12,paddingHorizontal:15,paddingVertical:10},addText:{color:"#FFF",fontWeight:"800"},categoryList:{paddingHorizontal:16,gap:7,paddingBottom:8},category:{paddingHorizontal:12,paddingVertical:8,borderWidth:1,borderColor:"#D7DDD9",borderRadius:18,backgroundColor:"#FFF"},categoryOn:{backgroundColor:"#DDF1E9",borderColor:"#257863"},categoryText:{fontWeight:"600",fontSize:12,color:"#53645F"},categoryTextOn:{color:"#17614F"},filters:{marginHorizontal:16,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},chips:{flexDirection:"row",gap:6,flexWrap:"wrap"},chip:{borderWidth:1,borderColor:"#D7DDD9",borderRadius:8,paddingHorizontal:9,paddingVertical:6},chipOn:{borderColor:"#257863",backgroundColor:"#DDF1E9"},chipText:{fontSize:12,fontWeight:"700",textTransform:"capitalize",color:"#42534E"},toggle:{fontSize:12,fontWeight:"700",color:"#257863"},list:{padding:16,paddingTop:8,paddingBottom:44},card:{backgroundColor:"#FFF",borderColor:"#E1E5E1",borderWidth:1,borderRadius:14,overflow:"hidden",marginBottom:9},done:{opacity:.58},row:{padding:12,flexDirection:"row",alignItems:"center",gap:10},check:{height:22,width:22,borderRadius:7,borderWidth:1.5,borderColor:"#AAB5B0",alignItems:"center",justifyContent:"center"},checkOn:{backgroundColor:"#257863",borderColor:"#257863"},checkMark:{color:"#FFF",fontWeight:"800"},content:{flex:1},title:{fontSize:15,fontWeight:"600",color:"#1F302B"},strike:{textDecorationLine:"line-through"},meta:{fontSize:12,color:"#73817C",marginTop:3},flag:{borderWidth:1,borderRadius:8,paddingHorizontal:8,paddingVertical:6},details:{padding:12,borderTopWidth:1,borderTopColor:"#E1E5E1",backgroundColor:"#FAFCFA",gap:7},label:{fontSize:12,fontWeight:"800",color:"#53645F"},notes:{minHeight:68,borderWidth:1,borderColor:"#D7DDD9",backgroundColor:"#FFF",borderRadius:10,padding:9,textAlignVertical:"top",color:"#1F302B"},empty:{alignItems:"center",paddingTop:70},emptyTitle:{fontSize:18,fontWeight:"800",color:"#1F302B"},error:{margin:16,padding:16,backgroundColor:"#FCE8E6",borderRadius:12},errorText:{color:"#A4312E",fontWeight:"700"},retry:{color:"#A4312E",fontWeight:"800",marginTop:8},backdrop:{flex:1,backgroundColor:"rgba(20,32,28,.45)",justifyContent:"flex-end"},modal:{backgroundColor:"#FFF",padding:20,borderTopLeftRadius:24,borderTopRightRadius:24,gap:12},modalTitle:{fontSize:22,fontWeight:"800",color:"#1F302B"},input:{borderWidth:1,borderColor:"#D7DDD9",borderRadius:10,padding:12,fontSize:16},actions:{flexDirection:"row",justifyContent:"flex-end",alignItems:"center",gap:16},cancel:{fontWeight:"700",color:"#53645F"},save:{backgroundColor:"#257863",borderRadius:10,paddingHorizontal:15,paddingVertical:10},saveText:{color:"#FFF",fontWeight:"800"}
});
