import { useState, useEffect, useRef } from "react";
import STDIN_item from "../components/STDIN_item.jsx";

export default function STDIN_manager(props) {
  const socket = props.socketRef.current;
  const [newInputValue, setNewInputValue] = useState("");
  function handleCreateInput() {
    const newList = [...props.stdinList, newInputValue];
    props.setStdinList(newList);
    setNewInputValue("");
    socket.emit("update_Input", {
      sessionID: props.sessionID,
      stdinList: newList,
    });
  }
  function handleDeleteItem(index) {
    const newList = props.stdinList.filter((_, i) => i !== index);

    props.setStdinList(newList);

    socket.emit("update_Input", {
      sessionID: props.sessionID,
      stdinList: newList,
    });
  }
  return (
    <div className="h-full flex flex-col min-h-0  border border-blue-500 ">
      <div className="flex p-2 ">
        <input
          type="text"
          value={newInputValue}
          onChange={(e) => setNewInputValue(e.target.value)}
          placeholder="Input"
          className="p-2 text-gray-200 placeholder:text-gray-400 rounded-xl flex-1 border border-gray-800 bg-gray-600"
        />
        <button
          className=" ml-2 text-lg text-gray-200 font-bold hover:bg-blue-600 hover:text-green-400 rounded-xl transition duration-200
                cursor-pointer bg-blue-000 w-10 border border-gray-800 bg-gray-600 "
          onClick={handleCreateInput}
        >
          ✔
        </button>
      </div>
      <div className=" border border-red-500 flex flex-col pl-10 p-2 overflow-y-auto flex-grow min-h-0 ">
        {props.stdinList.map((item, index) => (
          <STDIN_item
            key={index}
            value={item}
            onDelete={() => handleDeleteItem(index)}
          />
        ))}
      </div>
    </div>
  );
}
