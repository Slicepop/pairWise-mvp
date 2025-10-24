import { useState, useEffect, useRef } from "react";

export default function STDIN_item(props) {
  return (
    <>
      <div className="flex flex-row pb-3 ">
        <p className="p-2 text-gray-200 rounded-xl flex-1 border border-gray-800 bg-gray-700">
          {props.value}
        </p>
        <button
          className=" ml-2 text-lg text-gray-200 font-bold hover:bg-blue-600 hover:text-red-400 rounded-xl transition duration-200
                cursor-pointer bg-blue-000 w-10 border border-gray-800 bg-gray-600 "
          onClick={props.onDelete}
        >
          X
        </button>
      </div>
    </>
  );
}
