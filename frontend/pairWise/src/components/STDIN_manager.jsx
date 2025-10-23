import { useState, useEffect, useRef } from "react";
import STDIN_item from "../components/STDIN_item.jsx";

export default function STDIN_manager() {
  function handleCreateInput() {}
  return (
    <>
      <div className="flex p-2">
        <input
          type="text"
          placeholder="Input"
          className="p-2 text-gray-200 rounded-xl flex-1 border border-gray-800 bg-gray-600"
        />
        <button
          className=" ml-2 text-lg text-gray-200 font-bold hover:bg-blue-600 hover:text-green-400 rounded-xl transition duration-200
                cursor-pointer bg-blue-000 w-10 border border-gray-800 bg-gray-600 "
          onClick={handleCreateInput}
        >
          ✔
        </button>
      </div>
      <div className=" flex pl-10 p-2">
        <STDIN_item />
      </div>
    </>
  );
}
