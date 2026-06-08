import React, { useState, useEffect } from "react";
import { db } from "./firebase";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  onSnapshot,
} from "firebase/firestore";

const generateDateRange = (startDate, endDate) => {
  const dates = [];
  let currentDate = new Date(startDate);
  const end = new Date(endDate);

  while (currentDate <= end) {
    dates.push(currentDate.toISOString().split("T")[0]);
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return dates;
};

export default function App() {
  const [view, setView] = useState("lobby");
  const [roomData, setRoomData] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [filterCategory, setFilterCategory] = useState("全部");
  const [availableDates, setAvailableDates] = useState([]);
  const [dailyLocations, setDailyLocations] = useState({});
  const [itineraries, setItineraries] = useState([]);

  const [editingId, setEditingId] = useState(null);
  const [editItemForm, setEditItemForm] = useState({
    title: "",
    imageUrl: "",
    description: "",
    link: "",
    category: "景點",
  });

  const [joinRoomId, setJoinRoomId] = useState("");
  const [createForm, setCreateForm] = useState({
    name: "✈️ 我們的充電之旅",
    startDate: "2026-06-14",
    endDate: "2026-06-20",
    password: "123",
  });

  const [newItem, setNewItem] = useState({
    title: "",
    imageUrl: "",
    description: "",
    link: "",
    category: "景點",
  });

  // ====== 核心連線邏輯 ======
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlRoomId = params.get("roomId");
    const savedRoomId = localStorage.getItem("travelSync_roomId");
    const targetRoomId = urlRoomId || savedRoomId;

    if (targetRoomId) {
      const autoJoinRoom = async () => {
        const roomRef = doc(db, "trips", targetRoomId.toUpperCase());
        const roomSnap = await getDoc(roomRef);

        if (roomSnap.exists()) {
          const data = roomSnap.data();
          const dates = generateDateRange(data.startDate, data.endDate);
          setRoomData({ ...data, id: roomSnap.id });
          setAvailableDates(dates);
          setSelectedDate(dates[0]);
          setView("room");
          localStorage.setItem("travelSync_roomId", roomSnap.id);
        } else {
          if (urlRoomId) alert("無效的專屬連結，找不到該房間！");
          localStorage.removeItem("travelSync_roomId");
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname
          );
        }
      };
      autoJoinRoom();
    }
  }, []);

  useEffect(() => {
    if (view === "room" && roomData?.id) {
      const unsubRoom = onSnapshot(doc(db, "trips", roomData.id), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setDailyLocations(data.dailyLocations || {});
        }
      });

      const unsubItineraries = onSnapshot(
        collection(db, "trips", roomData.id, "itineraries"),
        (snapshot) => {
          const items = [];
          snapshot.forEach((doc) => {
            items.push({ id: doc.id, ...doc.data() });
          });

          items.sort((a, b) => {
            const orderA = a.order !== undefined ? a.order : a.createdAt;
            const orderB = b.order !== undefined ? b.order : b.createdAt;
            return orderA - orderB;
          });

          setItineraries(items);
        }
      );

      return () => {
        unsubRoom();
        unsubItineraries();
      };
    }
  }, [view, roomData?.id]);

  const handleCreateRoom = async () => {
    if (
      !createForm.name ||
      !createForm.startDate ||
      !createForm.endDate ||
      !createForm.password
    ) {
      alert("請填寫所有建立房間的欄位唷！");
      return;
    }
    const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const dates = generateDateRange(createForm.startDate, createForm.endDate);

    await setDoc(doc(db, "trips", newRoomId), {
      name: createForm.name,
      startDate: createForm.startDate,
      endDate: createForm.endDate,
      password: createForm.password,
      dailyLocations: {},
    });

    setRoomData({ ...createForm, id: newRoomId });
    setAvailableDates(dates);
    setSelectedDate(dates[0]);
    setView("room");
    localStorage.setItem("travelSync_roomId", newRoomId);
  };

  const handleJoinRoom = async () => {
    if (joinRoomId === "") return;
    const roomRef = doc(db, "trips", joinRoomId.toUpperCase());
    const roomSnap = await getDoc(roomRef);

    if (roomSnap.exists()) {
      const data = roomSnap.data();
      const dates = generateDateRange(data.startDate, data.endDate);
      setRoomData({ ...data, id: roomSnap.id });
      setAvailableDates(dates);
      setSelectedDate(dates[0]);
      setView("room");
      localStorage.setItem("travelSync_roomId", roomSnap.id);
    } else {
      alert("找不到這個房號，請確認後再試！");
    }
  };

  const handleUpdateDailyLocation = async (date, value) => {
    const roomRef = doc(db, "trips", roomData.id);
    await updateDoc(roomRef, { [`dailyLocations.${date}`]: value });
  };

  const displayItems = itineraries.filter(
    (item) =>
      item.date === selectedDate &&
      (filterCategory === "全部" || item.category === filterCategory)
  );

  const handleAddItinerary = async () => {
    if (!newItem.title) {
      alert("請至少輸入行程名稱唷！");
      return;
    }

    const currentMaxOrder =
      displayItems.length > 0
        ? Math.max(...displayItems.map((i) => i.order || 0))
        : 0;

    await addDoc(collection(db, "trips", roomData.id, "itineraries"), {
      ...newItem,
      date: selectedDate,
      order: currentMaxOrder + 1,
      createdAt: Date.now(),
    });
    setNewItem({
      title: "",
      imageUrl: "",
      description: "",
      link: "",
      category: "景點",
    });
  };

  const handleMoveOrder = async (index, direction) => {
    if (!isAdmin) return;
    const newItems = [...displayItems];

    if (direction === "up" && index > 0) {
      [newItems[index - 1], newItems[index]] = [
        newItems[index],
        newItems[index - 1],
      ];
    } else if (direction === "down" && index < newItems.length - 1) {
      [newItems[index], newItems[index + 1]] = [
        newItems[index + 1],
        newItems[index],
      ];
    } else {
      return;
    }

    await Promise.all(
      newItems.map((item, idx) => {
        const itemRef = doc(db, "trips", roomData.id, "itineraries", item.id);
        return updateDoc(itemRef, { order: idx });
      })
    );
  };

  const handleStartEdit = (item) => {
    setEditingId(item.id);
    setEditItemForm({
      title: item.title,
      imageUrl: item.imageUrl || "",
      description: item.description || "",
      link: item.link || "",
      category: item.category || "景點",
    });
  };

  const handleSaveEdit = async (itemId) => {
    if (!editItemForm.title) {
      alert("行程名稱不能留空唷！");
      return;
    }
    const itemRef = doc(db, "trips", roomData.id, "itineraries", itemId);
    await updateDoc(itemRef, { ...editItemForm });
    setEditingId(null);
  };

  const handleDeleteItem = async (itemId) => {
    if (window.confirm("確定要將這個行程永久刪除嗎？此動作無法復原唷！ 🗑️")) {
      await deleteDoc(doc(db, "trips", roomData.id, "itineraries", itemId));
    }
  };

  const handleFinishItem = async (itemId) => {
    if (window.confirm("確定已經逛完並刪除此行程嗎？ 🎉")) {
      await deleteDoc(doc(db, "trips", roomData.id, "itineraries", itemId));
    }
  };

  const handleReturnHome = () => {
    setView("lobby");
    setRoomData(null);
    setIsAdmin(false);
    window.history.replaceState({}, document.title, window.location.pathname);
    localStorage.removeItem("travelSync_roomId");
  };

  const handleImageUpload = (e, mode) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (mode === "edit") {
          setEditItemForm({ ...editItemForm, imageUrl: reader.result });
        } else {
          setNewItem({ ...newItem, imageUrl: reader.result });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCopyLink = () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?roomId=${roomData.id}`;
    navigator.clipboard.writeText(
      `✨ 旅遊名稱：${roomData.name}\n🔑 專屬房號：${roomData.id}\n🔗 專屬網址：${shareUrl}`
    );
    alert("已複製專屬邀請連結！傳給朋友點擊即可加入 🚀");
  };

  const handleAdminLogin = () => {
    if (isAdmin) {
      setIsAdmin(false);
      return;
    }
    const pwd = prompt("請輸入管理員密碼 🔒：");
    if (pwd === roomData.password) {
      setIsAdmin(true);
    } else if (pwd !== null) {
      alert("密碼錯誤，請重新輸入 🥺");
    }
  };

  // ====== UI 主題與樣式 ======
  const theme = {
    bg: "#FFF9F5",
    primary: "#D4B5A5",
    primaryDark: "#B89988",
    text: "#5C4E46",
    textLight: "#968A82",
    cardBg: "#FFFFFF",
    border: "#F0E6DF",
    shadow: "0 8px 24px rgba(92, 78, 70, 0.06)",
    radius: "16px",
  };

  const styles = {
    container: {
      backgroundColor: theme.bg,
      minHeight: "100vh",
      color: theme.text,
      fontFamily: "'Nunito', 'Noto Sans TC', sans-serif",
      padding: "15px",
      paddingBottom: "40px",
    },
    card: {
      backgroundColor: theme.cardBg,
      padding: "0",
      borderRadius: theme.radius,
      boxShadow: theme.shadow,
      border: `1px solid ${theme.border}`,
      marginBottom: "15px",
      display: "flex",
      flexDirection: "row",
      overflow: "hidden",
    },
    input: {
      width: "100%",
      padding: "14px 16px",
      marginBottom: "16px",
      backgroundColor: theme.bg,
      border: "none",
      borderRadius: "12px",
      color: theme.text,
      fontSize: "16px",
      outline: "none",
      transition: "0.2s",
    },
    btnPrimary: {
      width: "100%",
      padding: "16px",
      backgroundColor: theme.primary,
      color: theme.cardBg,
      border: "none",
      borderRadius: "12px",
      cursor: "pointer",
      fontSize: "16px",
      fontWeight: "bold",
      letterSpacing: "1px",
      boxShadow: "0 4px 12px rgba(212, 181, 165, 0.3)",
    },
    btnSecondary: {
      padding: "10px 16px",
      backgroundColor: theme.bg,
      color: theme.text,
      border: "none",
      borderRadius: "20px",
      cursor: "pointer",
      fontSize: "14px",
      fontWeight: "bold",
      color: theme.textLight,
    },
    navBtn: (isActive) => ({
      padding: "8px 18px",
      backgroundColor: isActive ? theme.text : theme.bg,
      color: isActive ? theme.cardBg : theme.text,
      border: "none",
      borderRadius: "20px",
      cursor: "pointer",
      fontSize: "15px",
      fontWeight: isActive ? "bold" : "normal",
      transition: "0.3s",
      flexShrink: 0,
    }),
  };

  const getCategoryEmoji = (cat) => {
    switch (cat) {
      case "景點":
        return "📸";
      case "美食":
        return "🍔";
      case "購物":
        return "🛍️";
      default:
        return "🌈";
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;700&family=Noto+Sans+TC:wght@400;700&display=swap');
        body { margin: 0; background-color: ${theme.bg}; -webkit-tap-highlight-color: transparent; }
        * { box-sizing: border-box; }
        input:focus, textarea:focus, select:focus { box-shadow: 0 0 0 2px ${theme.primary} !important; }
        ::-webkit-scrollbar { display: none; }
        
        @keyframes floatDown {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(6px); }
        }
        .flow-arrow {
          text-align: center;
          color: ${theme.primary};
          font-size: 24px;
          margin: 0px 0 15px 0;
          animation: floatDown 2s ease-in-out infinite;
          opacity: 0.8;
        }
        
        .title-link {
          text-decoration: none;
          color: ${theme.text};
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          transition: 0.2s;
        }
        .title-link:active {
          opacity: 0.6;
        }
        .title-link h3 {
          border-bottom: 2px dashed transparent;
          transition: 0.2s;
        }
        .title-link:hover h3 {
          border-bottom: 2px dashed ${theme.primary};
        }
      `}</style>

      {view === "lobby" && (
        <div
          style={{
            ...styles.container,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: "40px" }}>
            <div style={{ fontSize: "50px", marginBottom: "10px" }}>🏕️</div>
            <h1
              style={{
                letterSpacing: "2px",
                margin: 0,
                fontSize: "28px",
                fontWeight: "bold",
              }}
            >
              旅程同步大廳
            </h1>
            <p
              style={{
                color: theme.textLight,
                marginTop: "8px",
                fontSize: "14px",
              }}
            >
              即時連線，美好同行
            </p>
          </div>

          <div
            style={{
              backgroundColor: theme.cardBg,
              padding: "24px",
              borderRadius: theme.radius,
              boxShadow: theme.shadow,
              border: `1px solid ${theme.border}`,
              width: "100%",
              maxWidth: "400px",
              marginBottom: "10px",
            }}
          >
            <h2
              style={{
                fontSize: "18px",
                marginBottom: "20px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              ✨ 新建專屬行程
            </h2>
            <input
              style={styles.input}
              placeholder="旅遊名稱 (如: 首爾充電之旅)"
              value={createForm.name}
              onChange={(e) =>
                setCreateForm({ ...createForm, name: e.target.value })
              }
            />
            <div style={{ display: "flex", gap: "10px" }}>
              <input
                style={{ ...styles.input, color: theme.textLight }}
                type="date"
                value={createForm.startDate}
                onChange={(e) =>
                  setCreateForm({ ...createForm, startDate: e.target.value })
                }
              />
              <input
                style={{ ...styles.input, color: theme.textLight }}
                type="date"
                value={createForm.endDate}
                onChange={(e) =>
                  setCreateForm({ ...createForm, endDate: e.target.value })
                }
              />
            </div>
            <input
              style={styles.input}
              type="password"
              placeholder="設定管理員密碼 🔒"
              value={createForm.password}
              onChange={(e) =>
                setCreateForm({ ...createForm, password: e.target.value })
              }
            />
            <button style={styles.btnPrimary} onClick={handleCreateRoom}>
              建立房間 🚀
            </button>
          </div>

          <div
            style={{
              backgroundColor: theme.cardBg,
              padding: "24px",
              borderRadius: theme.radius,
              boxShadow: theme.shadow,
              border: `1px solid ${theme.border}`,
              width: "100%",
              maxWidth: "400px",
            }}
          >
            <h2
              style={{
                fontSize: "18px",
                marginBottom: "20px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              🚪 加入現有行程
            </h2>
            <input
              style={styles.input}
              placeholder="輸入房號 (例: TRK9A2)"
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value)}
            />
            <button
              style={{
                ...styles.btnPrimary,
                backgroundColor: theme.bg,
                color: theme.text,
                boxShadow: "none",
              }}
              onClick={handleJoinRoom}
            >
              進入房間 ✈️
            </button>
          </div>
        </div>
      )}

      {view === "room" && (
        <div style={styles.container}>
          <div style={{ maxWidth: "600px", margin: "0 auto" }}>
            <div
              style={{
                backgroundColor: theme.cardBg,
                padding: "24px",
                borderRadius: theme.radius,
                boxShadow: theme.shadow,
                border: `1px solid ${theme.border}`,
                marginBottom: "15px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "16px",
                }}
              >
                <button
                  onClick={handleReturnHome}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "8px 0",
                    color: theme.textLight,
                    cursor: "pointer",
                    fontSize: "15px",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <span>👈</span> 回大廳
                </button>
                <button
                  onClick={handleAdminLogin}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "8px 0",
                    color: isAdmin ? theme.primary : theme.textLight,
                    cursor: "pointer",
                    fontSize: "15px",
                    fontWeight: isAdmin ? "bold" : "normal",
                  }}
                >
                  {isAdmin ? "🔓 編輯中" : "🔒 編輯"}
                </button>
              </div>

              <h1
                style={{
                  fontSize: "26px",
                  margin: "0 0 8px 0",
                  fontWeight: "bold",
                }}
              >
                {roomData.name}
              </h1>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: theme.bg,
                  padding: "10px 16px",
                  borderRadius: "12px",
                }}
              >
                <span style={{ fontSize: "14px", color: theme.textLight }}>
                  房號：
                  <strong style={{ color: theme.text }}>{roomData.id}</strong>
                </span>
                <button
                  onClick={handleCopyLink}
                  style={{
                    background: "none",
                    border: "none",
                    color: theme.primary,
                    fontWeight: "bold",
                    fontSize: "14px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  🔗 複製連結
                </button>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: "10px",
                overflowX: "auto",
                paddingBottom: "15px",
                marginBottom: "10px",
              }}
            >
              {availableDates.map((date) => {
                const isSelected = selectedDate === date;
                const [, month, day] = date.split("-");
                return (
                  <button
                    key={date}
                    onClick={() => setSelectedDate(date)}
                    style={{
                      border: "none",
                      backgroundColor: isSelected
                        ? theme.primary
                        : theme.cardBg,
                      color: isSelected ? theme.cardBg : theme.textLight,
                      padding: "12px 20px",
                      borderRadius: "16px",
                      fontSize: "16px",
                      fontWeight: "bold",
                      cursor: "pointer",
                      boxShadow: isSelected
                        ? `0 4px 12px rgba(212, 181, 165, 0.4)`
                        : theme.shadow,
                      flexShrink: 0,
                      transition: "0.3s",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <span style={{ fontSize: "12px", opacity: 0.8 }}>
                      {month}月
                    </span>
                    <span>{day}日</span>
                  </button>
                );
              })}
            </div>

            <div
              style={{
                backgroundColor: theme.cardBg,
                padding: "16px 20px",
                borderRadius: theme.radius,
                boxShadow: theme.shadow,
                border: `1px solid ${theme.border}`,
                marginBottom: "15px",
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <div style={{ fontSize: "20px" }}>📍</div>
              <div style={{ flexGrow: 1 }}>
                <div
                  style={{
                    fontSize: "12px",
                    color: theme.textLight,
                    marginBottom: "4px",
                  }}
                >
                  當日主要活動區域
                </div>
                {isAdmin ? (
                  <input
                    key={`location-input-${selectedDate}`}
                    style={{
                      width: "100%",
                      border: "none",
                      borderBottom: `2px dashed ${theme.border}`,
                      backgroundColor: "transparent",
                      color: theme.text,
                      outline: "none",
                      padding: "4px 0",
                      fontSize: "16px",
                      fontWeight: "bold",
                    }}
                    placeholder="點此輸入 (例: 明洞商圈)..."
                    defaultValue={dailyLocations[selectedDate] || ""}
                    onBlur={(e) => {
                      if (
                        e.target.value !== (dailyLocations[selectedDate] || "")
                      ) {
                        handleUpdateDailyLocation(selectedDate, e.target.value);
                      }
                    }}
                  />
                ) : (
                  <div
                    style={{
                      fontSize: "16px",
                      fontWeight: "bold",
                      color: dailyLocations[selectedDate]
                        ? theme.text
                        : theme.border,
                    }}
                  >
                    {dailyLocations[selectedDate] || "尚未設定區域"}
                  </div>
                )}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: "8px",
                overflowX: "auto",
                paddingBottom: "10px",
                marginBottom: "15px",
              }}
            >
              {["全部", "景點", "美食", "購物"].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  style={styles.navBtn(filterCategory === cat)}
                >
                  {getCategoryEmoji(cat)} {cat}
                </button>
              ))}
            </div>

            {displayItems.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  color: theme.textLight,
                  padding: "60px 20px",
                  backgroundColor: theme.cardBg,
                  borderRadius: theme.radius,
                  border: `1px dashed ${theme.border}`,
                }}
              >
                <div style={{ fontSize: "40px", marginBottom: "10px" }}>🧳</div>
                <p>
                  當天尚未安排 {filterCategory !== "全部" ? filterCategory : ""}{" "}
                  行程喔！
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {displayItems.map((item, index) => (
                  <React.Fragment key={item.id}>
                    <div style={styles.card}>
                      {isAdmin && filterCategory === "全部" && (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                            alignItems: "center",
                            padding: "10px 8px",
                            backgroundColor: theme.bg,
                            borderRight: `1px solid ${theme.border}`,
                            width: "44px",
                            flexShrink: 0,
                          }}
                        >
                          <button
                            onClick={() => handleMoveOrder(index, "up")}
                            disabled={index === 0}
                            style={{
                              background: "none",
                              border: "none",
                              fontSize: "20px",
                              padding: "12px 0",
                              cursor: index === 0 ? "not-allowed" : "pointer",
                              opacity: index === 0 ? 0.2 : 1,
                              transition: "0.2s",
                            }}
                          >
                            🔼
                          </button>
                          <button
                            onClick={() => handleMoveOrder(index, "down")}
                            disabled={index === displayItems.length - 1}
                            style={{
                              background: "none",
                              border: "none",
                              fontSize: "20px",
                              padding: "12px 0",
                              cursor:
                                index === displayItems.length - 1
                                  ? "not-allowed"
                                  : "pointer",
                              opacity:
                                index === displayItems.length - 1 ? 0.2 : 1,
                              transition: "0.2s",
                            }}
                          >
                            🔽
                          </button>
                        </div>
                      )}

                      <div
                        style={{
                          flexGrow: 1,
                          display: "flex",
                          flexDirection: "column",
                          minWidth: 0,
                        }}
                      >
                        {editingId === item.id ? (
                          <div
                            style={{
                              padding: "20px",
                              backgroundColor: "#FFFDFB",
                            }}
                          >
                            <div
                              style={{
                                fontSize: "13px",
                                color: theme.primary,
                                fontWeight: "bold",
                                marginBottom: "10px",
                              }}
                            >
                              ✏️ 正在修改行程內容
                            </div>
                            <input
                              style={{
                                ...styles.input,
                                backgroundColor: theme.cardBg,
                                border: `1px solid ${theme.border}`,
                              }}
                              placeholder="🏷️ 行程名稱"
                              value={editItemForm.title}
                              onChange={(e) =>
                                setEditItemForm({
                                  ...editItemForm,
                                  title: e.target.value,
                                })
                              }
                            />
                            <div
                              style={{
                                ...styles.input,
                                backgroundColor: theme.cardBg,
                                border: `1px solid ${theme.border}`,
                                display: "flex",
                                alignItems: "center",
                                padding: "10px 16px",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "14px",
                                  color: theme.textLight,
                                  marginRight: "10px",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                🖼️ 換張圖片：
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleImageUpload(e, "edit")}
                                style={{
                                  fontSize: "13px",
                                  width: "100%",
                                  color: theme.textLight,
                                }}
                              />
                            </div>
                            <input
                              style={{
                                ...styles.input,
                                backgroundColor: theme.cardBg,
                                border: `1px solid ${theme.border}`,
                              }}
                              placeholder="🔗 Map 或網址連結"
                              value={editItemForm.link}
                              onChange={(e) =>
                                setEditItemForm({
                                  ...editItemForm,
                                  link: e.target.value,
                                })
                              }
                            />
                            <select
                              style={{
                                ...styles.input,
                                backgroundColor: theme.cardBg,
                                border: `1px solid ${theme.border}`,
                              }}
                              value={editItemForm.category}
                              onChange={(e) =>
                                setEditItemForm({
                                  ...editItemForm,
                                  category: e.target.value,
                                })
                              }
                            >
                              <option value="景點">📸 景點</option>
                              <option value="美食">🍔 美食</option>
                              <option value="購物">🛍️ 購物</option>
                            </select>
                            <textarea
                              style={{
                                ...styles.input,
                                backgroundColor: theme.cardBg,
                                border: `1px solid ${theme.border}`,
                                height: "80px",
                                resize: "none",
                              }}
                              placeholder="📝 筆記備註..."
                              value={editItemForm.description}
                              onChange={(e) =>
                                setEditItemForm({
                                  ...editItemForm,
                                  description: e.target.value,
                                })
                              }
                            />
                            <div
                              style={{
                                display: "flex",
                                gap: "10px",
                                marginTop: "5px",
                              }}
                            >
                              <button
                                onClick={() => handleSaveEdit(item.id)}
                                style={{
                                  flex: 1,
                                  padding: "12px",
                                  backgroundColor: theme.primary,
                                  color: theme.cardBg,
                                  border: "none",
                                  borderRadius: "10px",
                                  fontWeight: "bold",
                                  cursor: "pointer",
                                }}
                              >
                                💾 儲存修改
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                style={{
                                  flex: 1,
                                  padding: "12px",
                                  backgroundColor: theme.bg,
                                  color: theme.textLight,
                                  border: "none",
                                  borderRadius: "10px",
                                  fontWeight: "bold",
                                  cursor: "pointer",
                                }}
                              >
                                ❌ 取消
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {item.imageUrl && (
                              <a
                                href={item.link || "#"}
                                target={item.link ? "_blank" : "_self"}
                                rel="noopener noreferrer"
                                style={{
                                  display: "block",
                                  cursor: item.link ? "pointer" : "default",
                                }}
                              >
                                <img
                                  src={item.imageUrl}
                                  alt={item.title}
                                  style={{
                                    width: "100%",
                                    height: "180px",
                                    objectFit: "cover",
                                  }}
                                />
                              </a>
                            )}

                            <div style={{ padding: "16px 20px" }}>
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "flex-start",
                                  marginBottom: "12px",
                                }}
                              >
                                {/* 🛠️ 修正：讓標題變成可點擊的連結，並加上視覺提示 */}
                                {item.link ? (
                                  <a
                                    href={item.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="title-link"
                                  >
                                    <h3
                                      style={{
                                        margin: 0,
                                        fontSize: "20px",
                                        fontWeight: "bold",
                                        lineHeight: "1.3",
                                      }}
                                    >
                                      {item.title}
                                    </h3>
                                    <span style={{ fontSize: "16px" }}>🔗</span>
                                  </a>
                                ) : (
                                  <h3
                                    style={{
                                      margin: 0,
                                      fontSize: "20px",
                                      fontWeight: "bold",
                                      lineHeight: "1.3",
                                      color: theme.text,
                                    }}
                                  >
                                    {item.title}
                                  </h3>
                                )}

                                <span
                                  style={{
                                    fontSize: "12px",
                                    backgroundColor: theme.bg,
                                    color: theme.textLight,
                                    padding: "6px 10px",
                                    borderRadius: "8px",
                                    fontWeight: "bold",
                                    whiteSpace: "nowrap",
                                    marginLeft: "10px",
                                  }}
                                >
                                  {getCategoryEmoji(item.category)}{" "}
                                  {item.category}
                                </span>
                              </div>

                              {item.description && (
                                <p
                                  style={{
                                    fontSize: "15px",
                                    color: theme.textLight,
                                    lineHeight: "1.6",
                                    margin: "0 0 16px 0",
                                  }}
                                >
                                  {item.description}
                                </p>
                              )}

                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "8px",
                                }}
                              >
                                <button
                                  onClick={() => handleFinishItem(item.id)}
                                  style={{
                                    width: "100%",
                                    padding: "12px",
                                    backgroundColor: theme.bg,
                                    color: theme.textLight,
                                    border: "none",
                                    borderRadius: "12px",
                                    fontSize: "15px",
                                    fontWeight: "bold",
                                    cursor: "pointer",
                                    transition: "0.2s",
                                  }}
                                >
                                  ✅ 標記為已逛完並移除
                                </button>

                                {isAdmin && (
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: "8px",
                                      marginTop: "4px",
                                    }}
                                  >
                                    <button
                                      onClick={() => handleStartEdit(item)}
                                      style={{
                                        flex: 1,
                                        padding: "10px",
                                        backgroundColor: "#FFFFFF",
                                        color: theme.text,
                                        border: `1px solid ${theme.border}`,
                                        borderRadius: "10px",
                                        fontSize: "14px",
                                        fontWeight: "bold",
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        gap: "4px",
                                      }}
                                    >
                                      ✏️ 編輯
                                    </button>
                                    <button
                                      onClick={() => handleDeleteItem(item.id)}
                                      style={{
                                        flex: 1,
                                        padding: "10px",
                                        backgroundColor: "#FCE8E6",
                                        color: "#C5221F",
                                        border: "none",
                                        borderRadius: "10px",
                                        fontSize: "14px",
                                        fontWeight: "bold",
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        gap: "4px",
                                      }}
                                    >
                                      🗑️ 刪除
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {index < displayItems.length - 1 && (
                      <div className="flow-arrow">⏬</div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}

            {isAdmin && (
              <div
                style={{
                  backgroundColor: "transparent",
                  padding: "24px",
                  borderRadius: theme.radius,
                  border: `2px dashed ${theme.primary}`,
                  marginTop: "20px",
                }}
              >
                <h2
                  style={{
                    fontSize: "18px",
                    marginBottom: "20px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  ✏️ 新增行程
                </h2>

                <input
                  style={{ ...styles.input, backgroundColor: theme.cardBg }}
                  placeholder="🏷️ 自訂名稱 (如：高空景觀餐廳)"
                  value={newItem.title}
                  onChange={(e) =>
                    setNewItem({ ...newItem, title: e.target.value })
                  }
                />

                <div
                  style={{
                    ...styles.input,
                    backgroundColor: theme.cardBg,
                    display: "flex",
                    alignItems: "center",
                    padding: "10px 16px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "15px",
                      color: theme.textLight,
                      marginRight: "10px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    🖼️ 上傳圖片：
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, "create")}
                    style={{
                      fontSize: "14px",
                      width: "100%",
                      color: theme.textLight,
                    }}
                  />
                </div>

                {newItem.imageUrl && (
                  <div
                    style={{
                      marginBottom: "16px",
                      borderRadius: "12px",
                      overflow: "hidden",
                    }}
                  >
                    <img
                      src={newItem.imageUrl}
                      alt="預覽"
                      style={{
                        width: "100%",
                        height: "160px",
                        objectFit: "cover",
                      }}
                    />
                  </div>
                )}

                <input
                  style={{ ...styles.input, backgroundColor: theme.cardBg }}
                  placeholder="🔗 自訂連結 (貼上 Google Map 網址)"
                  value={newItem.link}
                  onChange={(e) =>
                    setNewItem({ ...newItem, link: e.target.value })
                  }
                />

                <select
                  style={{ ...styles.input, backgroundColor: theme.cardBg }}
                  value={newItem.category}
                  onChange={(e) =>
                    setNewItem({ ...newItem, category: e.target.value })
                  }
                >
                  <option value="景點">📸 景點</option>
                  <option value="美食">🍔 美食</option>
                  <option value="購物">🛍️ 購物</option>
                </select>

                <textarea
                  style={{
                    ...styles.input,
                    backgroundColor: theme.cardBg,
                    height: "100px",
                    resize: "none",
                  }}
                  placeholder="📝 寫些筆記或提醒事項吧..."
                  value={newItem.description}
                  onChange={(e) =>
                    setNewItem({ ...newItem, description: e.target.value })
                  }
                />

                <button
                  style={{ ...styles.btnPrimary, marginTop: "8px" }}
                  onClick={handleAddItinerary}
                >
                  💾 儲存行程至 {selectedDate}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
